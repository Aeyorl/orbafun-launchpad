// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title AMMRouter
/// @notice Atomic swap router for Orba AMM pairs. Fixes the concurrent-swap
///         "AMM: K" failure that occurs when users transfer-then-swap directly
///         against AMMPair (the transfer-then-swap pattern lets concurrent
///         swappers double-spend price impact).
///         The router does `transferFrom` + `swap` in a single transaction,
///         so reserves are read atomically and the invariant holds.
/// @dev No multi-hop, no WETH wrapping, no fee-on-switch — Orba's AMM is a
///      minimal Uniswap V2 fork with 0% swap fee (fees are captured on the
///      bonding curve only). Two single-hop swap functions:
///        - swapExactUSDCForTokens(amountIn, amountOutMin, pair, to)
///        - swapExactTokensForUSDC(amountIn, amountOutMin, pair, to)
///      Caller must have approved the router to spend `amountIn` of the input
///      token. Output is sent to `to`. Slippage protected by `amountOutMin`.
///      See DECISION_LOG D6, D7. See AGENTS.md "AMM swap test" note.
import {SafeUSDC} from "./SafeUSDC.sol";

interface IAMMFactory {
    function getPair(address tokenA, address tokenB) external view returns (address);
}

interface IAMMPair {
    function token0() external view returns (address);
    function token1() external view returns (address);
    function getReserves() external view returns (uint112, uint112, uint32);
    function swap(uint256 amount0Out, uint256 amount1Out, address to) external;
}

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

contract AMMRouter {
    /// @notice Arc USDC (6-dec ERC-20, same address as 18-dec native gas asset).
    address public constant USDC = 0x3600000000000000000000000000000000000000;
    IAMMFactory public immutable factory;

    error InsufficientOutputAmount();
    error TransferFromFailed();
    error TransferFailed();
    error ExcessiveInputAmount();
    error ZeroAddress();
    error InvalidPair();
    error Expired();

    constructor(address factory_) {
        if (factory_ == address(0) || factory_.code.length == 0) revert ZeroAddress();
        factory = IAMMFactory(factory_);
    }

    /// @notice Swap an exact amount of USDC for as many tokens as possible.
    /// @dev Caller must have approved the router to spend `amountIn` USDC.
    /// @param amountIn    USDC to spend (6-dec).
    /// @param amountOutMin Minimum tokens to receive (slippage protection).
    /// @param pair        The AMM pair (USDC ↔ token) to swap through.
    /// @param to          Recipient of output tokens.
    /// @return amountOut  Tokens received.
    function swapExactUSDCForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        uint256 deadline,
        address pair,
        address to
    ) external returns (uint256 amountOut) {
        if (to == address(0)) revert ZeroAddress();
        if (amountIn == 0) revert InsufficientOutputAmount();
        if (block.timestamp > deadline) revert Expired();
        _validatePair(pair);

        // 1. Pull USDC from caller into the pair (atomic — no race window).
        //    Arc USDC's transferFrom returns void, so use SafeUSDC.
        bool ok = SafeUSDC.transferFrom(msg.sender, pair, amountIn);
        if (!ok) revert TransferFromFailed();

        // 2. Compute output from the pair's CURRENT reserves (post-transfer).
        amountOut = _getOutput(USDC, amountIn, pair);
        if (amountOut < amountOutMin) revert InsufficientOutputAmount();

        // 3. Execute the swap. Output sent to `to`.
        _swap(pair, USDC, amountOut, to);
    }

    /// @notice Swap an exact amount of tokens for as much USDC as possible.
    /// @dev Caller must have approved the router to spend `amountIn` tokens.
    /// @param amountIn    Tokens to sell.
    /// @param amountOutMin Minimum USDC to receive (slippage protection).
    /// @param pair        The AMM pair (token ↔ USDC) to swap through.
    /// @param to          Recipient of output USDC.
    /// @return amountOut  USDC received (6-dec).
    function swapExactTokensForUSDC(
        uint256 amountIn,
        uint256 amountOutMin,
        uint256 deadline,
        address pair,
        address to
    ) external returns (uint256 amountOut) {
        if (to == address(0)) revert ZeroAddress();
        if (amountIn == 0) revert InsufficientOutputAmount();
        if (block.timestamp > deadline) revert Expired();

        address tokenIn = _validatePair(pair);

        // 1. Pull tokens from caller into the pair.
        //    MemeToken is a standard ERC-20 (returns bool on transferFrom).
        bool ok = IERC20(tokenIn).transferFrom(msg.sender, pair, amountIn);
        if (!ok) revert TransferFromFailed();

        // 2. Compute USDC output from the pair's current reserves.
        amountOut = _getOutput(tokenIn, amountIn, pair);
        if (amountOut < amountOutMin) revert InsufficientOutputAmount();

        // 3. Execute the swap. USDC sent to `to`.
        _swap(pair, tokenIn, amountOut, to);
    }

    // ─── Internal helpers ──────────────────────────────────────────────────

    /// @dev Given an input amount and the pair's reserves, compute the output
    ///      amount using the constant-product formula (0% fee — see AMMPair).
    ///      amountOut = (amountIn * reserveOut) / (reserveIn + amountIn)
    function _getOutput(address tokenIn, uint256 amountIn, address pair)
        internal
        view
        returns (uint256)
    {
        (uint112 reserve0, uint112 reserve1,) = IAMMPair(pair).getReserves();
        (uint256 reserveIn, uint256 reserveOut) = _tokenInIsToken0(pair, tokenIn)
            ? (uint256(reserve0), uint256(reserve1))
            : (uint256(reserve1), uint256(reserve0));
        if (reserveIn == 0 || reserveOut == 0) revert InsufficientOutputAmount();
        // No swap fee on this AMM (v1). If a fee is added later, multiply
        // amountIn by (10000 - feeBps) / 10000 before this calculation.
        return (amountIn * reserveOut) / (reserveIn + amountIn);
    }

    /// @dev Execute the swap on the pair. Routes the output to the correct
    ///      token slot (amount0Out vs amount1Out) based on which token is out.
    function _swap(address pair, address tokenIn, uint256 amountOut, address to) internal {
        address token0 = IAMMPair(pair).token0();
        if (tokenIn == token0) {
            // Input is token0 → output is token1.
            IAMMPair(pair).swap(0, amountOut, to);
        } else {
            // Input is token1 → output is token0.
            IAMMPair(pair).swap(amountOut, 0, to);
        }
    }

    /// @dev True if `tokenIn` is the pair's token0.
    function _tokenInIsToken0(address pair, address tokenIn) internal view returns (bool) {
        return IAMMPair(pair).token0() == tokenIn;
    }

    function _validatePair(address pair) internal view returns (address token) {
        if (pair == address(0) || pair.code.length == 0) revert InvalidPair();
        address token0 = IAMMPair(pair).token0();
        address token1 = IAMMPair(pair).token1();
        if (token0 == USDC && token1 != address(0) && token1 != USDC) {
            token = token1;
        } else if (token1 == USDC && token0 != address(0) && token0 != USDC) {
            token = token0;
        } else {
            revert InvalidPair();
        }
        if (factory.getPair(token, USDC) != pair) revert InvalidPair();
    }
}
