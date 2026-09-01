// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title MemeToken
/// @notice Fixed-supply ERC-20 for tokens launched on Orba.
/// @dev Supply is immutable after construction. The bonding curve owns the
///      token until graduation, and user-to-user transfers have an anti-bot
///      cooldown while the curve is active.
import {ERC20} from "solady/tokens/ERC20.sol";
import {Ownable} from "solady/auth/Ownable.sol";

contract MemeToken is ERC20, Ownable {
    /// @notice Cooldown blocks between transfers per wallet.
    /// @dev Arc block time is approximately 0.5 seconds, so 30 blocks is
    ///      approximately 15 seconds. See DECISION_LOG D3 and D20.
    uint256 public constant COOLDOWN_BLOCKS = 30;

    /// @notice Total supply: 1,000,000,000 tokens, with 18 decimals.
    uint256 public constant TOTAL_SUPPLY = 1_000_000_000 * 10 ** 18;

    /// @notice Address of this token's bonding curve.
    address public bondingCurve;

    /// @notice Whether the token has graduated to the AMM.
    /// @dev Graduation disables the transfer cooldown and renounces ownership.
    bool public graduated;

    /// @notice Last block tokens left an owner's balance.
    mapping(address => uint256) public lastTxBlock;

    string private _name;
    string private _symbol;

    event Graduated(address indexed token, address indexed ammPair);

    error CooldownActive(uint256 lastBlock, uint256 currentBlock);
    error OnlyBondingCurve();

    constructor(string memory name_, string memory symbol_, address, address bondingCurve_) {
        _name = name_;
        _symbol = symbol_;
        _initializeOwner(bondingCurve_);
        bondingCurve = bondingCurve_;

        // The entire fixed supply starts on the curve: no team allocation,
        // presale, withheld supply, later mint, or freeze authority.
        _mint(bondingCurve_, TOTAL_SUPPLY);
    }

    /// @notice Marks the token as graduated. Only callable by its curve.
    function graduate(address ammPair) external {
        if (msg.sender != bondingCurve) revert OnlyBondingCurve();
        graduated = true;
        bondingCurve = address(0);
        emit Graduated(address(this), ammPair);
        renounceOwnership();
    }

    /// @dev Enforces only the user-to-user transfer cooldown before graduation.
    ///      Curve buys/sells, minting, and burning remain exempt.
    function _beforeTokenTransfer(address from, address to, uint256) internal override {
        if (!graduated && msg.sender != bondingCurve && from != address(0) && to != address(0)) {
            uint256 currentBlock = block.number;
            if (lastTxBlock[from] != 0 && currentBlock - lastTxBlock[from] < COOLDOWN_BLOCKS) {
                revert CooldownActive(lastTxBlock[from], currentBlock);
            }
            lastTxBlock[from] = currentBlock;
        }
    }

    function name() public view override returns (string memory) {
        return _name;
    }

    function symbol() public view override returns (string memory) {
        return _symbol;
    }
}
