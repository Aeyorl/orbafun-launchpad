// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title LiquidityMigration
/// @notice Handles graduation: migrates bonding curve reserve to our AMM,
///         burns LP tokens, renounces token ownership. Atomic — all or nothing.
/// @dev Flow:
///      1. Anyone calls checkAndMigrate(token) after observing market cap
///         cross threshold (or curve fully sold).
///      2. This contract calls curve.graduateToAmm(this, ammPair) which:
///         - Transfers reserved tokens (12%) to this contract
///         - Transfers LP seed USDC ($8,500) to this contract
///         - Calls token.graduate(ammPair) which renounces ownership
///      3. This contract creates the AMM pair (if not exists), adds liquidity,
///         and burns the LP tokens to 0x...dEaD.
///      All steps are atomic — if any fails, the whole migration reverts.
///      See DECISION_LOG D6, D7, D8, D20.
import {Ownable} from "solady/auth/Ownable.sol";
import {TokenFactory} from "./TokenFactory.sol";
import {BondingCurve} from "./BondingCurve.sol";
import {AMMFactory} from "./AMMFactory.sol";
import {AMMPair} from "./AMMPair.sol";
import {SafeUSDC} from "./SafeUSDC.sol";

interface IERC20Minimal {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

interface IMemeTokenMigrate {
    function transfer(address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function totalSupply() external view returns (uint256);
}

contract LiquidityMigration is Ownable {
    /// @notice The canonical burn address for LP tokens.
    /// @dev Using 0x...dEaD (not address(0)) because Arc forbids native value
    ///      transfers to address(0). ERC-20 transfers to address(0) may work
    ///      but 0x...dEaD is the safer, conventional choice. See DECISION_LOG D8.
    address public constant BURN_ADDRESS = 0x000000000000000000000000000000000000dEaD;

    /// @notice USDC contract address on Arc (6-dec ERC-20).
    address public constant USDC = 0x3600000000000000000000000000000000000000;

    TokenFactory public immutable factory;
    AMMFactory public immutable ammFactory;

    /// @notice AMM pair for each graduated token.
    mapping(address => address) public tokenToAmmPair;

    event TokenMigrated(address indexed token, address indexed ammPair, uint256 lpBurned);
    error NotGraduated();
    error AlreadyMigrated();
    error NotTokenFactory();
    error TransferFailed();
    error LiquidityAddFailed();

    constructor(address factory_, address ammFactory_) {
        _initializeOwner(msg.sender);
        factory = TokenFactory(factory_);
        ammFactory = AMMFactory(ammFactory_);
    }

    /// @notice Check if a token should graduate and migrate if so.
    /// @dev Anyone can call this — it's permissionless. The curve's marketCap()
    ///      and tokensSold determine if graduation should trigger.
    function checkAndMigrate(address tokenAddress) external {
        TokenFactory.LaunchToken memory lt = factory.getToken(tokenAddress);
        if (lt.curve == address(0)) revert NotTokenFactory();
        if (lt.graduated) revert AlreadyMigrated();
        if (tokenToAmmPair[tokenAddress] != address(0)) revert AlreadyMigrated();

        BondingCurve curve = BondingCurve(lt.curve);
        // Check graduation conditions: market cap >= threshold OR all tokens sold.
        bool shouldGraduate = curve.marketCap() >= curve.GRADUATION_MARKET_CAP()
            || curve.tokensSold() >= curve.SUPPLY_ON_CURVE();
        if (!shouldGraduate) revert NotGraduated();

        // 1. Create AMM pair (token + USDC) if it doesn't exist.
        address pair = ammFactory.getPair(tokenAddress, USDC);
        if (pair == address(0)) {
            pair = ammFactory.createPair(tokenAddress, USDC);
        }
        tokenToAmmPair[tokenAddress] = pair;

        uint256 tokenBalanceBefore = IMemeTokenMigrate(tokenAddress).balanceOf(address(this));
        uint256 usdcBalanceBefore = IERC20Minimal(USDC).balanceOf(address(this));

        // 2. Pull reserved tokens + LP USDC from curve (via graduateToAmm).
        //    This also calls token.graduate(pair) which renounces ownership.
        curve.graduateToAmm(address(this), pair);

        // 3. Add liquidity to the AMM pair.
        //    Transfer token + USDC to the pair, then call pair.mint().
        uint256 tokenAmount =
            IMemeTokenMigrate(tokenAddress).balanceOf(address(this)) - tokenBalanceBefore;
        uint256 usdcAmount = IERC20Minimal(USDC).balanceOf(address(this)) - usdcBalanceBefore;

        if (tokenAmount > 0 && usdcAmount > 0) {
            // Transfer tokens + USDC to the pair, then mint LP.
            if (!IMemeTokenMigrate(tokenAddress).transfer(pair, tokenAmount)) revert TransferFailed();
            if (!SafeUSDC.transfer(pair, usdcAmount)) revert TransferFailed();

            // Mint LP tokens to this contract.
            AMMPair(pair).mint(address(this));
        }

        // 4. Burn LP tokens — transfer to 0x...dEaD.
        uint256 lpBalance = AMMPair(pair).balanceOf(address(this));
        if (lpBalance > 0) {
            if (!AMMPair(pair).transfer(BURN_ADDRESS, lpBalance)) revert TransferFailed();
        }

        // 5. Token is marked graduated in factory by the curve (in graduateToAmm).

        emit TokenMigrated(tokenAddress, pair, lpBalance);
    }

    /// @notice Get the AMM pair address for a graduated token.
    function getAmmPair(address tokenAddress) external view returns (address) {
        return tokenToAmmPair[tokenAddress];
    }
}
