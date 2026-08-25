// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title AMMPair
/// @notice Minimal Uniswap-V2-style constant-product AMM pair.
/// @dev Adapted for Arc: no WETH, no flash loans, no flash swaps, no
///      fee-on-switch, no protocol fee. Core swap/liquidity/burn logic only.
///      LP tokens are standard ERC-20 (minted on addLiquidity, burned on
///      removeLiquidity or burn). LP burn to 0x...dEaD for graduation uses
///      the burn() function which sends LP to msg.sender (then migrator
///      transfers to 0x...dEaD). See DECISION_LOG D6, D7, D8.
///      Audit note: this is a minimal fork of audited Uniswap V2 core logic.
///      Modifications: removed fee-on-switch, removed flash loans, removed
///      price oracles, simplified. Core invariant (x*y=k) preserved.
import {ERC20} from "solady/tokens/ERC20.sol";
import {ReentrancyGuard} from "solady/utils/ReentrancyGuard.sol";

interface IERC20Minimal {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

contract AMMPair is ERC20, ReentrancyGuard {
    address public immutable token0;
    address public immutable token1;

    uint112 private reserve0;
    uint112 private reserve1;
    uint32 private blockTimestampLast;

    /// @notice Emitted on every swap.
    event Swap(address indexed sender, address indexed to, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out);
    /// @notice Emitted on every sync (reserve update).
    event Sync(uint112 reserve0, uint112 reserve1);
    /// @notice Emitted on liquidity mint.
    event Mint(address indexed sender, uint256 amount0, uint256 amount1);
    /// @notice Emitted on liquidity burn.
    event Burn(address indexed sender, uint256 amount0, uint256 amount1, address indexed to);

    error InsufficientLiquidityMinted();
    error InsufficientLiquidityBurned();
    error InsufficientOutputAmount();
    error InsufficientLiquidity();
    error InvalidToken();
    error TransferFailed();

    constructor(address token0_, address token1_) {
        token0 = token0_;
        token1 = token1_;
    }

    /// @notice Current reserves.
    function getReserves() external view returns (uint112, uint112, uint32) {
        return (reserve0, reserve1, blockTimestampLast);
    }

    /// @notice Mint LP tokens for providing liquidity.
    /// @dev Caller must have transferred token0 and token1 to this pair first.
    ///      LP minted = min(amount0 * totalSupply / reserve0, amount1 * totalSupply / reserve1).
    ///      First liquidity sets LP supply = sqrt(amount0 * amount1).
    function mint(address to) external nonReentrant returns (uint256 liquidity) {
        uint256 balance0 = IERC20Minimal(token0).balanceOf(address(this));
        uint256 balance1 = IERC20Minimal(token1).balanceOf(address(this));
        uint256 amount0 = balance0 - reserve0;
        uint256 amount1 = balance1 - reserve1;

        uint256 _totalSupply = totalSupply();
        if (_totalSupply == 0) {
            // First liquidity: geometric mean.
            liquidity = sqrt(amount0 * amount1) - uint256(1) * 10 ** 3; // MINIMUM_LIQUIDITY = 1e3
            _mint(address(0), uint256(1) * 10 ** 3); // Lock minimum liquidity to address(0).
        } else {
            liquidity = min((amount0 * _totalSupply) / reserve0, (amount1 * _totalSupply) / reserve1);
        }
        if (liquidity == 0) revert InsufficientLiquidityMinted();

        _mint(to, liquidity);
        _update(balance0, balance1);
        emit Mint(msg.sender, amount0, amount1);
    }

    /// @notice Burn LP tokens and return the underlying tokens.
    /// @dev LP tokens are burned from this contract's balance (caller must have
    ///      transferred LP here first). Underlying tokens sent to `to`.
    function burn(address to) external nonReentrant returns (uint256 amount0, uint256 amount1) {
        uint256 balance0 = IERC20Minimal(token0).balanceOf(address(this));
        uint256 balance1 = IERC20Minimal(token1).balanceOf(address(this));
        uint256 liquidity = balanceOf(address(this));

        uint256 _totalSupply = totalSupply();
        amount0 = (liquidity * balance0) / _totalSupply;
        amount1 = (liquidity * balance1) / _totalSupply;
        if (amount0 == 0 || amount1 == 0) revert InsufficientLiquidityBurned();

        _burn(address(this), liquidity);
        _safeTransfer(token0, to, amount0);
        _safeTransfer(token1, to, amount1);
        balance0 = IERC20Minimal(token0).balanceOf(address(this));
        balance1 = IERC20Minimal(token1).balanceOf(address(this));

        _update(balance0, balance1);
        emit Burn(msg.sender, amount0, amount1, to);
    }

    /// @notice Swap tokens. Caller must have transferred input tokens first.
    /// @dev Constant-product: x*y=k. No fee (v1 — fees on bonding curve only).
    ///      amount0Out/amount1Out are the tokens to send to `to`.
    ///      Input is inferred from reserve change after transfer.
    function swap(uint256 amount0Out, uint256 amount1Out, address to) external nonReentrant {
        if (amount0Out == 0 && amount1Out == 0) revert InsufficientOutputAmount();

        (uint112 _reserve0, uint112 _reserve1,) = (reserve0, reserve1, 0);
        if (amount0Out >= _reserve0 || amount1Out >= _reserve1) revert InsufficientLiquidity();

        uint256 balance0 = IERC20Minimal(token0).balanceOf(address(this)) - amount0Out;
        uint256 balance1 = IERC20Minimal(token1).balanceOf(address(this)) - amount1Out;

        // Invariant check: k must not decrease.
        // balance0 * balance1 >= reserve0 * reserve1
        require(balance0 * balance1 >= uint256(_reserve0) * uint256(_reserve1), "AMM: K");

        if (amount0Out > 0) _safeTransfer(token0, to, amount0Out);
        if (amount1Out > 0) _safeTransfer(token1, to, amount1Out);

        _update(balance0, balance1);
        emit Swap(msg.sender, to, 0, 0, amount0Out, amount1Out); // Simplified: amounts in inferred off-chain
    }

    /// @notice Force reserves to match balances (after direct token transfers).
    function sync() external {
        _update(IERC20Minimal(token0).balanceOf(address(this)), IERC20Minimal(token1).balanceOf(address(this)));
    }

    // ─── Internal ───────────────────────────────────────────────────────────
    function _update(uint256 balance0, uint256 balance1) internal {
        if (balance0 > type(uint112).max || balance1 > type(uint112).max) revert InsufficientLiquidity();
        // Bounds are checked immediately above.
        // forge-lint: disable-next-line(unsafe-typecast)
        reserve0 = uint112(balance0);
        // Bounds are checked immediately above.
        // forge-lint: disable-next-line(unsafe-typecast)
        reserve1 = uint112(balance1);
        blockTimestampLast = uint32(block.timestamp);
        emit Sync(reserve0, reserve1);
    }

    function _safeTransfer(address token, address to, uint256 amount) internal {
        if (!IERC20Minimal(token).transfer(to, amount)) revert TransferFailed();
    }

    function min(uint256 a, uint256 b) internal pure returns (uint256) {
        return a < b ? a : b;
    }

    function sqrt(uint256 y) internal pure returns (uint256 z) {
        if (y > 3) {
            z = y;
            uint256 x = y / 2 + 1;
            while (x < z) {
                z = x;
                x = (y / x + x) / 2;
            }
        } else if (y != 0) {
            z = 1;
        }
    }

    // ─── ERC20 metadata (Solady overrides) ──────────────────────────────────
    function name() public pure override returns (string memory) {
        return "Orba AMM LP";
    }

    function symbol() public pure override returns (string memory) {
        return "ARCFUN-LP";
    }
}
