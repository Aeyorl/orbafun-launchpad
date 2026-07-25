// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title TestBondingCurve
/// @notice Copy of BondingCurve with a LOW graduation threshold ($4,150) for
///         budget-constrained graduation testing. The production BondingCurve
///         graduates at $25,000 MC — reaching that requires ~$8,800 in buys,
///         which is too expensive for testnet iteration. This test version
///         graduates at $4,150 MC, reachable with ~$110 of buys.
/// @dev The ONLY change from BondingCurve.sol is GRADUATION_MARKET_CAP.
///      All other economics, fees, reentrancy guards, and logic are identical.
///      The graduation flow (LiquidityMigration.checkAndMigrate → curve.graduateToAmm
///      → token.graduate → AMM pair creation → LP burn) is unchanged — only the
///      threshold that triggers it differs. LP_SEED_USDC is capped by realUsdc
///      via min(realUsdc, LP_SEED_USDC), so the AMM pool will just be smaller.
import {IERC20} from "forge-std/interfaces/IERC20.sol";
import {SafeUSDC} from "../SafeUSDC.sol";
import {ReentrancyGuard} from "solady/utils/ReentrancyGuard.sol";

interface ITokenFactory {
    function markGraduated(address token, address ammPair) external;
}

interface IMemeToken {
    function graduate(address ammPair) external;
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function totalSupply() external view returns (uint256);
}

contract TestBondingCurve is ReentrancyGuard {
    // ─── Economics constants (DECISION_LOG D20) ─────────────────────────────
    /// @notice Total token supply: 1,000,000,000 (1B) with 18 decimals.
    uint256 public constant TOTAL_SUPPLY = 1_000_000_000 * 10 ** 18;
    /// @notice Supply on curve: 88% of total (880M tokens).
    uint256 public constant SUPPLY_ON_CURVE = (TOTAL_SUPPLY * 88) / 100;
    /// @notice Supply reserved for DEX liquidity: 12% of total (120M tokens).
    uint256 public constant SUPPLY_RESERVED = TOTAL_SUPPLY - SUPPLY_ON_CURVE;
    /// @notice Virtual USDC reserve (6-dec). Sets initial price.
    uint256 public constant VIRTUAL_USDC = 5866_666700; // 5866.67 USDC (6 dec)
    /// @notice Virtual token reserve (18-dec). Curve shape.
    uint256 public constant VIRTUAL_TOKENS = 1_466_666_667 * 10 ** 18;
    /// @notice k = VIRTUAL_USDC * VIRTUAL_TOKENS (constant product).
    uint256 public constant K = VIRTUAL_USDC * VIRTUAL_TOKENS;
    /// @notice Graduation market cap threshold: $4,150 (6-dec USDC).
    /// @dev LOW threshold for testnet — production is $25,000. Reaching $4,150 MC
    ///      from $4,000 initial MC requires ~$110 of buys (fits testnet budget).
    uint256 public constant GRADUATION_MARKET_CAP = 4_150 * 10 ** 6;
    /// @notice USDC to seed DEX liquidity on graduation: $8,500 (6-dec).
    uint256 public constant LP_SEED_USDC = 8_500 * 10 ** 6;
    /// @notice Trading fee: 1% (in basis points = 100).
    uint256 public constant FEE_BPS = 100;
    /// @notice Creator share of fee: 50% (in basis points = 5000).
    uint256 public constant CREATOR_FEE_SHARE_BPS = 5000;

    // ─── USDC (6-dec ERC-20 on Arc) ─────────────────────────────────────────
    IERC20 public immutable usdc;
    address public constant USDC_ADDRESS = 0x3600000000000000000000000000000000000000;

    // ─── Token & parties ────────────────────────────────────────────────────
    IMemeToken public token; // set after construction via setToken() (2-step init)
    address public immutable creator;
    address public immutable factory;
    address public owner; // protocol owner (treasury), set at construction
    address public migrator; // LiquidityMigration contract, set by factory

    // ─── Curve state ────────────────────────────────────────────────────────
    /// @notice Real USDC collected (net of fees). 6-dec.
    uint256 public realUsdc;
    /// @notice Tokens sold from the curve. 18-dec.
    uint256 public tokensSold;
    /// @notice Creator fees accrued (claimable). 6-dec.
    uint256 public creatorFeesAccrued;
    /// @notice Protocol fees accrued (claimable). 6-dec.
    uint256 public protocolFeesAccrued;
    /// @notice Whether the curve has graduated (no more trading).
    bool public graduated;

    // ─── Events ─────────────────────────────────────────────────────────────
    event Buy(address indexed buyer, uint256 usdcIn, uint256 tokensOut, uint256 price);
    event Sell(address indexed seller, uint256 tokensIn, uint256 usdcOut, uint256 price);
    event Graduated(address indexed token, address indexed ammPair, uint256 lpUsdc, uint256 lpTokens);
    event CreatorFeesClaimed(address indexed creator, uint256 amount);
    event ProtocolFeesClaimed(address indexed owner, uint256 amount);

    // ─── Errors ─────────────────────────────────────────────────────────────
    error NotGraduated();
    error AlreadyGraduated();
    error InsufficientLiquidity();
    error SlippageExceeded(uint256 minOut, uint256 actualOut);
    error OnlyCreator();
    error OnlyOwner();
    error OnlyFactory();
    error OnlyMigrator();
    error OnlyToken();
    error TransferFailed();
    error TokenAlreadySet();
    error MigratorAlreadySet();

    // ─── Events: excess USDC sweep ───────────────────────────────────────────
    event ExcessUsdcSwept(address indexed owner, uint256 amount);

    constructor(address token_, address creator_, address owner_) {
        token = IMemeToken(token_);
        creator = creator_;
        owner = owner_;
        factory = msg.sender;
        usdc = IERC20(USDC_ADDRESS);
    }

    /// @notice Sets the token address. Only callable once, by the factory.
    /// @dev Two-step init: curve deployed first (token unknown), then token
    ///      deployed with curve address, then this called to wire token in.
    function setToken(address token_) external {
        if (msg.sender != factory) revert OnlyFactory();
        if (address(token) != address(0)) revert TokenAlreadySet();
        token = IMemeToken(token_);
    }

    /// @notice Sets the migrator address. Only callable once, by the factory.
    /// @dev The migrator is the LiquidityMigration contract that handles
    ///      graduation. Set by the factory after deployment.
    function setMigrator(address migrator_) external {
        if (msg.sender != factory) revert OnlyFactory();
        if (migrator != address(0)) revert MigratorAlreadySet();
        migrator = migrator_;
    }

    // ─── Curve math (view) ──────────────────────────────────────────────────
    /// @notice Current x = virtual USDC + real USDC collected. 6-dec.
    function reserveUsdc() public view returns (uint256) {
        return VIRTUAL_USDC + realUsdc;
    }

    /// @notice Current y = virtual tokens - tokens sold. 18-dec.
    function reserveTokens() public view returns (uint256) {
        return VIRTUAL_TOKENS - tokensSold;
    }

    /// @notice Current price: USDC per token, scaled by 1e30 for precision.
    /// @dev Returns price in (USDC 6-dec * 1e30) per 1 whole token (1e18).
    ///      The extra 1e12 scaling avoids integer division truncation.
    ///      To get USDC per token: price() / 1e30.
    function price() public view returns (uint256) {
        return (reserveUsdc() * 10 ** 30) / reserveTokens();
    }

    /// @notice Market cap: price * total supply. 6-dec USDC.
    /// @dev Computed directly (not via price()) to avoid precision loss.
    ///      marketCap = (reserveUsdc * TOTAL_SUPPLY) / reserveTokens
    function marketCap() public view returns (uint256) {
        return (reserveUsdc() * TOTAL_SUPPLY) / reserveTokens();
    }

    /// @notice Tokens remaining on the curve (not yet sold). 18-dec.
    function tokensRemaining() public view returns (uint256) {
        return SUPPLY_ON_CURVE - tokensSold;
    }

    // ─── Quotes (view, no state change) ─────────────────────────────────────
    /// @notice Quote: how many tokens for `usdcAmount` USDC (after fee). 18-dec out.
    function quoteBuy(uint256 usdcAmount) public view returns (uint256) {
        if (usdcAmount == 0) return 0;
        uint256 fee = (usdcAmount * FEE_BPS) / 10_000;
        uint256 usdcToCurve = usdcAmount - fee;
        uint256 oldX = reserveUsdc();
        uint256 newX = oldX + usdcToCurve;
        uint256 newY = K / newX;
        return reserveTokens() - newY;
    }

    /// @notice Quote: how much USDC for `tokenAmount` tokens (after fee). 6-dec out.
    function quoteSell(uint256 tokenAmount) public view returns (uint256) {
        if (tokenAmount == 0) return 0;
        uint256 oldY = reserveTokens();
        uint256 newY = oldY + tokenAmount;
        uint256 newX = K / newY;
        uint256 usdcGross = reserveUsdc() - newX;
        uint256 fee = (usdcGross * FEE_BPS) / 10_000;
        return usdcGross - fee;
    }

    // ─── Trading ────────────────────────────────────────────────────────────
    /// @notice Buy tokens with USDC. Requires prior `approve` on USDC.
    /// @param usdcAmount USDC to spend (6-dec). Pulled via transferFrom.
    /// @param minTokensOut Minimum tokens to receive (slippage protection). 18-dec.
    function buy(uint256 usdcAmount, uint256 minTokensOut) external nonReentrant returns (uint256 tokensOut) {
        if (graduated) revert AlreadyGraduated();
        if (usdcAmount == 0) revert InsufficientLiquidity();

        // Calculate fee and amount to curve.
        uint256 fee = (usdcAmount * FEE_BPS) / 10_000;
        uint256 usdcToCurve = usdcAmount - fee;

        // Pull USDC from buyer (6-dec ERC-20).
        uint256 balBefore = usdc.balanceOf(address(this));
        if (!SafeUSDC.transferFrom(msg.sender, address(this), usdcAmount)) revert TransferFailed();
        if (usdc.balanceOf(address(this)) - balBefore != usdcAmount) revert TransferFailed();

        // Accrue fees (separate from reserves — see DECISION_LOG D19).
        creatorFeesAccrued += (fee * CREATOR_FEE_SHARE_BPS) / 10_000;
        protocolFeesAccrued += fee - ((fee * CREATOR_FEE_SHARE_BPS) / 10_000);

        // Curve math: x*y=k.
        uint256 oldX = reserveUsdc();
        uint256 newX = oldX + usdcToCurve;
        uint256 newY = K / newX;
        tokensOut = reserveTokens() - newY;

        // Check we don't exceed supply on curve.
        if (tokensSold + tokensOut > SUPPLY_ON_CURVE) {
            // Partial fill — only sell remaining tokens.
            uint256 remaining = SUPPLY_ON_CURVE - tokensSold;
            if (remaining == 0) revert InsufficientLiquidity();

            // Recompute: how much usdcToCurve buys exactly `remaining` tokens?
            // y_final = VIRTUAL_TOKENS - SUPPLY_ON_CURVE
            // x_final = K / y_final
            // usdcToCurve_needed = x_final - oldX
            uint256 yFinal = VIRTUAL_TOKENS - SUPPLY_ON_CURVE;
            uint256 xFinal = K / yFinal;
            uint256 usdcToCurveNeeded = xFinal - oldX;
            uint256 usdcNeeded = (usdcToCurveNeeded * 10_000) / (10_000 - FEE_BPS);
            uint256 refund = usdcAmount - usdcNeeded;

            // Refund excess USDC to buyer.
            if (refund > 0) {
                if (!SafeUSDC.transfer(msg.sender, refund)) revert TransferFailed();
            }

            // Adjust fee accruals to match actual usdcNeeded.
            uint256 actualFee = usdcNeeded - usdcToCurveNeeded;
            // Undo over-accrued fees, accrue correct amount.
            creatorFeesAccrued -= (fee * CREATOR_FEE_SHARE_BPS) / 10_000;
            protocolFeesAccrued -= fee - ((fee * CREATOR_FEE_SHARE_BPS) / 10_000);
            creatorFeesAccrued += (actualFee * CREATOR_FEE_SHARE_BPS) / 10_000;
            protocolFeesAccrued += actualFee - ((actualFee * CREATOR_FEE_SHARE_BPS) / 10_000);

            tokensOut = remaining;
            realUsdc += usdcToCurveNeeded;
            tokensSold = SUPPLY_ON_CURVE;
        } else {
            realUsdc += usdcToCurve;
            tokensSold += tokensOut;
        }

        // Slippage check.
        if (tokensOut < minTokensOut) revert SlippageExceeded(minTokensOut, tokensOut);

        // Transfer tokens to buyer.
        if (!token.transfer(msg.sender, tokensOut)) revert TransferFailed();

        emit Buy(msg.sender, usdcAmount, tokensOut, price());

        // Check for graduation (after every buy that could push over threshold).
        if (marketCap() >= GRADUATION_MARKET_CAP || tokensSold >= SUPPLY_ON_CURVE) {
            _triggerGraduation();
        }
    }

    /// @notice Sell tokens for USDC.
    /// @param tokenAmount Tokens to sell (18-dec). Transferred to curve.
    /// @param minUsdcOut Minimum USDC to receive (slippage protection). 6-dec.
    function sell(uint256 tokenAmount, uint256 minUsdcOut) external nonReentrant returns (uint256 usdcOut) {
        if (graduated) revert AlreadyGraduated();
        if (tokenAmount == 0) revert InsufficientLiquidity();
        if (tokenAmount > tokensSold) revert InsufficientLiquidity();

        // Pull tokens from seller.
        if (!token.transferFrom(msg.sender, address(this), tokenAmount)) revert TransferFailed();

        // Curve math: x*y=k.
        uint256 oldY = reserveTokens();
        uint256 newY = oldY + tokenAmount;
        uint256 newX = K / newY;
        uint256 usdcGross = reserveUsdc() - newX;

        // Fee from output.
        uint256 fee = (usdcGross * FEE_BPS) / 10_000;
        usdcOut = usdcGross - fee;

        // Slippage check.
        if (usdcOut < minUsdcOut) revert SlippageExceeded(minUsdcOut, usdcOut);

        // Update state.
        realUsdc -= usdcGross;
        tokensSold -= tokenAmount;

        // Accrue fees.
        creatorFeesAccrued += (fee * CREATOR_FEE_SHARE_BPS) / 10_000;
        protocolFeesAccrued += fee - ((fee * CREATOR_FEE_SHARE_BPS) / 10_000);

        // Pay seller (6-dec ERC-20 transfer).
        // Note: may revert if seller is USDC-blocklisted (Arc runtime blocklist).
        // This is defined behavior — sell reverts cleanly, tokens remain held.
        // See DECISION_LOG D5, D20.
        if (!SafeUSDC.transfer(msg.sender, usdcOut)) revert TransferFailed();

        emit Sell(msg.sender, tokenAmount, usdcOut, price());
    }

    // ─── Graduation ─────────────────────────────────────────────────────────
    /// @notice Called by the factory's LiquidityMigration to graduate the token.
    /// @dev Transfers reserved tokens + LP USDC to the migrator, then calls
    ///      token.graduate() to disable curve limits and renounce ownership.
    ///      The migrator handles AMM pool creation and LP burn.
    function graduateToAmm(address migrator_, address ammPair) external {
        if (msg.sender != migrator) revert OnlyMigrator();
        if (graduated) revert AlreadyGraduated();

        graduated = true;

        // Mark token as graduated FIRST — this disables max-wallet and cooldown
        // on the token, so the large transfer of reserved tokens to the migrator
        // is not blocked by the max-wallet check.
        token.graduate(ammPair);

        // Transfer reserved tokens (12%) to the migrator for AMM liquidity.
        if (!token.transfer(migrator_, SUPPLY_RESERVED)) revert TransferFailed();

        // Transfer LP seed USDC to the migrator.
        uint256 lpUsdc = realUsdc < LP_SEED_USDC ? realUsdc : LP_SEED_USDC;
        if (lpUsdc > 0) {
            if (!SafeUSDC.transfer(migrator_, lpUsdc)) revert TransferFailed();
        }

        // Mark token as graduated in factory (curve is authorized caller).
        ITokenFactory(factory).markGraduated(address(token), ammPair);

        emit Graduated(address(token), ammPair, lpUsdc, SUPPLY_RESERVED);
    }

    // ─── Fee claims ─────────────────────────────────────────────────────────
    /// @notice Creator claims accrued creator fees.
    function claimCreatorFees() external nonReentrant {
        if (msg.sender != creator) revert OnlyCreator();
        uint256 amount = creatorFeesAccrued;
        if (amount == 0) return;
        creatorFeesAccrued = 0;
        if (!SafeUSDC.transfer(creator, amount)) revert TransferFailed();
        emit CreatorFeesClaimed(creator, amount);
    }

    /// @notice Protocol owner claims accrued protocol fees.
    function claimProtocolFees() external nonReentrant {
        if (msg.sender != owner) revert OnlyOwner();
        uint256 amount = protocolFeesAccrued;
        if (amount == 0) return;
        protocolFeesAccrued = 0;
        if (!SafeUSDC.transfer(owner, amount)) revert TransferFailed();
        emit ProtocolFeesClaimed(owner, amount);
    }

    /// @notice Sweep excess USDC left in the curve after graduation.
    /// @dev After graduation, graduateToAmm() transfers LP_SEED_USDC ($8,500) to
    ///      the migrator for AMM liquidity. The remaining realUsdc (typically
    ///      ~$6,170 at $25K graduation) would otherwise be permanently locked.
    ///      This function sends the excess to the protocol owner (treasury).
    ///      Unclaimed creator/protocol fees are reserved and not swept.
    ///      Only callable after graduation, by the owner.
    function sweepExcessUsdc() external nonReentrant {
        if (!graduated) revert NotGraduated();
        if (msg.sender != owner) revert OnlyOwner();
        // Actual USDC balance = realUsdc + accrued fees (fees are held in-contract).
        // After graduation, lpUsdc was already sent to the migrator, so the
        // remaining balance is: realUsdc - lpUsdc_sent + creatorFeesAccrued + protocolFeesAccrued.
        // We sweep everything except the unclaimed fees (which are still claimable
        // by creator/owner respectively).
        uint256 balance = usdc.balanceOf(address(this));
        uint256 reserved = creatorFeesAccrued + protocolFeesAccrued;
        if (balance <= reserved) return; // nothing to sweep
        uint256 sweepable = balance - reserved;
        if (!SafeUSDC.transfer(owner, sweepable)) revert TransferFailed();
        emit ExcessUsdcSwept(owner, sweepable);
    }

    // ─── Internal ───────────────────────────────────────────────────────────
    /// @dev Triggers graduation. Called after buys that cross the threshold.
    function _triggerGraduation() internal {
        // Graduation is handled by the factory's LiquidityMigration contract.
        // We just emit an event here; the factory/indexer watches for it and
        // calls graduateToAmm() via the migration contract.
        // In a single-tx flow, the factory's buy() wrapper would call this.
        // For now, graduation is triggered externally by the migrator after
        // observing the market cap cross threshold.
        //
        // Note: This is a design choice — graduation could be auto-triggered
        // in the same tx as the threshold-crossing buy, but that requires the
        // BondingCurve to know the AMM factory address (circular dependency).
        // Instead, the factory/migrator watches and triggers graduation in a
        // separate tx, or the buy() function calls back to the factory.
        //
        // For v1 simplicity: graduation is triggered by anyone calling the
        // LiquidityMigration contract's checkAndMigrate() after observing the
        // threshold cross. This is gas-efficient and avoids circular deps.
    }
}
