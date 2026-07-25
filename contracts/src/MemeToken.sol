// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title MemeToken
/// @notice Fixed-supply ERC-20 for tokens launched on Orba.
/// @dev No mint function exists — total supply is set at creation and never
///      changes. No freeze function — tokens are fully immutable post-launch
///      by design (trustlessness). Anti-bot cooldown enforced via block number.
///      Uses Solady ERC20 for gas-optimized implementation.
///      See DECISION_LOG.md D6 (no freeze), D3 (block time ~0.5s for cooldown).
import {ERC20} from "solady/tokens/ERC20.sol";
import {Ownable} from "solady/auth/Ownable.sol";

contract MemeToken is ERC20, Ownable {
    /// @notice Cooldown blocks between transfers per wallet.
    /// @dev Arc block time ~0.5s. 30 blocks ≈ 15 seconds — enough to slow
    ///      sniping bots without harming real users. See DECISION_LOG D3, D20.
    uint256 public constant COOLDOWN_BLOCKS = 30;

    /// @notice Max wallet holding % of total supply (pre-graduation).
    /// @dev 4% of 1B supply = 40M tokens. Enforced only while the bonding
    ///      curve is active (before graduation). Post-graduation, free trading.
    ///      See DECISION_LOG D20 (max-wallet is a known limitation — bypassable
    ///      via multiple wallets, documented honestly).
    uint256 public constant MAX_WALLET_PCT = 4; // 4% of total supply

    /// @notice Total supply: 1,000,000,000 tokens (1B), 18 decimals.
    uint256 public constant TOTAL_SUPPLY = 1_000_000_000 * 10 ** 18;

    /// @notice Address of this token's bonding curve (enforces max-wallet).
    address public bondingCurve;

    /// @notice Whether the token has graduated to the AMM.
    /// @dev Set to true by LiquidityMigration via the bonding curve. When true,
    ///      max-wallet and cooldown are disabled — free trading on the AMM.
    bool public graduated;

    /// @notice Last block a wallet transferred tokens.
    mapping(address => uint256) public lastTxBlock;

    string private _name;
    string private _symbol;

    /// @notice Emitted when the token graduates to the AMM.
    event Graduated(address indexed token, address indexed ammPair);

    /// @notice Thrown when a transfer violates the cooldown.
    error CooldownActive(uint256 lastBlock, uint256 currentBlock);
    /// @notice Thrown when a transfer would exceed max wallet holding.
    error MaxWalletExceeded(uint256 balance, uint256 amount, uint256 max);
    /// @notice Thrown when a non-curve address tries to set curve-only state.
    error OnlyBondingCurve();

    constructor(string memory name_, string memory symbol_, address creator_, address bondingCurve_) {
        _name = name_;
        _symbol = symbol_;
        // Owner is the bonding curve (not the creator) — the only ownership
        // action is renouncing on graduation, which the curve triggers.
        // The creator has no token admin powers (no mint, no freeze) — see D6.
        _initializeOwner(bondingCurve_);
        bondingCurve = bondingCurve_;

        // All supply minted to the bonding curve at creation — no team allocation,
        // no presale, no withheld supply. See DECISION_LOG D20.
        _mint(bondingCurve_, TOTAL_SUPPLY);
    }

    /// @notice Returns the max wallet holding (pre-graduation).
    function maxWallet() public pure returns (uint256) {
        return (TOTAL_SUPPLY * MAX_WALLET_PCT) / 100;
    }

    /// @notice Marks the token as graduated. Only callable by bonding curve
    ///         (which is called by LiquidityMigration).
    /// @dev Disables max-wallet and cooldown. Renounces ownership.
    function graduate(address ammPair) external {
        if (msg.sender != bondingCurve) revert OnlyBondingCurve();
        graduated = true;
        bondingCurve = address(0);
        emit Graduated(address(this), ammPair);
        renounceOwnership();
    }

    /// @dev Enforces cooldown and max-wallet on transfers (pre-graduation).
    function _beforeTokenTransfer(address from, address to, uint256 amount) internal override {
        // Cooldown: skip for bonding curve (it does buys/sells), mint (constructor),
        // and zero-address (burn). Only enforce on user-to-user transfers.
        if (!graduated && msg.sender != bondingCurve && from != address(0) && to != address(0)) {
            uint256 currentBlock = block.number;
            if (lastTxBlock[msg.sender] != 0 && currentBlock - lastTxBlock[msg.sender] < COOLDOWN_BLOCKS) {
                revert CooldownActive(lastTxBlock[msg.sender], currentBlock);
            }
            lastTxBlock[msg.sender] = currentBlock;
        }

        // Max-wallet: only pre-graduation, enforced on the receiver (to).
        // Skip when to is the curve (sells back to curve) or zero (burns).
        // The curve itself holds full supply pre-graduation, so we don't check it.
        if (!graduated && to != address(0) && to != bondingCurve) {
            uint256 newBalance = balanceOf(to) + amount;
            if (newBalance > maxWallet()) {
                revert MaxWalletExceeded(balanceOf(to), amount, maxWallet());
            }
        }
    }

    /// @dev Solady ERC20 overrides for name/symbol.
    function name() public view override returns (string memory) {
        return _name;
    }

    function symbol() public view override returns (string memory) {
        return _symbol;
    }
}
