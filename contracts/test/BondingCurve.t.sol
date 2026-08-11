// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test, Vm} from "forge-std/Test.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";
import {MemeToken} from "../src/MemeToken.sol";
import {BondingCurve} from "../src/BondingCurve.sol";
import {TokenFactory} from "../src/TokenFactory.sol";
import {Treasury} from "../src/Treasury.sol";
import {AMMFactory} from "../src/AMMFactory.sol";
import {AMMPair} from "../src/AMMPair.sol";
import {LiquidityMigration} from "../src/LiquidityMigration.sol";

/// @title BondingCurveTest
/// @notice Tier 1 forge tests — pure EVM logic (no Arc-specific behavior).
/// @dev Uses MockUSDC at the real Arc USDC address (0x3600...) via vm.etch.
///      Tier 2 integration tests run against Arc testnet for USDC native
///      behavior, EIP-7708 events, blocklist. See Phase 1 spec.
contract BondingCurveTest is Test {
    // Real Arc USDC address (we put MockUSDC bytecode here via etch).
    address constant USDC = 0x3600000000000000000000000000000000000000;

    MockUSDC usdc;
    Treasury treasury;
    TokenFactory factory;
    AMMFactory ammFactory;
    LiquidityMigration migrator;

    address owner = address(this);
    address creator = address(0xC0FFEE);
    address buyer1 = address(0xB0B);
    address buyer2 = address(0xA11CE);

    address token;
    address curve;
    MemeToken tokenContract;
    BondingCurve curveContract;

    function setUp() public {
        // Place MockUSDC at the real Arc USDC address.
        vm.etch(USDC, type(MockUSDC).runtimeCode);
        usdc = MockUSDC(USDC);

        // Fund test accounts with USDC (6-dec).
        usdc.mint(address(this), 1_000_000 * 10 ** 6);
        usdc.mint(creator, 100_000 * 10 ** 6);
        usdc.mint(buyer1, 100_000 * 10 ** 6);
        usdc.mint(buyer2, 100_000 * 10 ** 6);

        // Deploy protocol contracts.
        treasury = new Treasury();
        factory = new TokenFactory(address(treasury));
        ammFactory = new AMMFactory();
        migrator = new LiquidityMigration(address(factory), address(ammFactory));

        // Wire migrator into factory (so new curves get the migrator address).
        factory.setMigrator(address(migrator));

        // Approve factory to spend USDC for creation fees.
        usdc.approve(address(factory), type(uint256).max);
    }

    // ─── Helper: launch a token ─────────────────────────────────────────────
    function launchToken() internal returns (address, address) {
        vm.prank(creator);
        usdc.approve(address(factory), type(uint256).max);
        vm.prank(creator);
        (address t, address c) = factory.createToken("Test Token", "TEST", "ipfs://img", "desc");
        token = t;
        curve = c;
        tokenContract = MemeToken(t);
        curveContract = BondingCurve(c);
        return (t, c);
    }

    // ─── Helper: buy tokens ─────────────────────────────────────────────────
    function buy(address buyer, uint256 usdcAmount) internal returns (uint256) {
        vm.startPrank(buyer);
        usdc.approve(curve, type(uint256).max);
        uint256 tokensOut = curveContract.buy(usdcAmount, 0);
        vm.stopPrank();
        return tokensOut;
    }

    // ═══ TESTS ═══════════════════════════════════════════════════════════════

    /// @notice Test: token launches with correct supply and initial state.
    function test_TokenLaunch() public {
        launchToken();

        // Total supply: 1B tokens (18-dec).
        assertEq(tokenContract.totalSupply(), 1_000_000_000 * 10 ** 18, "total supply");

        // All tokens on the curve.
        assertEq(tokenContract.balanceOf(curve), 1_000_000_000 * 10 ** 18, "tokens on curve");

        // Initial market cap: ~$4,000.
        uint256 mcap = curveContract.marketCap();
        assertApproxEqAbs(mcap, 4_000 * 10 ** 6, 10 * 10 ** 6, "initial market cap ~$4000");

        // Bonding curve is the token owner (renounces on graduation).
        assertEq(tokenContract.owner(), curve, "curve is token owner");

        // Curve has correct creator and owner.
        assertEq(curveContract.creator(), creator, "curve creator");
        assertEq(curveContract.owner(), address(treasury), "curve owner = treasury");
    }

    /// @notice Test: buy tokens, verify curve math and fee accrual.
    function test_Buy() public {
        launchToken();

        uint256 tokensOut = buy(buyer1, 100 * 10 ** 6); // 100 USDC

        // Buyer received tokens.
        assertGt(tokensOut, 0, "tokens out > 0");
        assertEq(tokenContract.balanceOf(buyer1), tokensOut, "buyer balance");

        // Curve collected USDC (net of fee).
        // 100 USDC in, 1% fee = 1 USDC, 99 USDC to curve.
        assertApproxEqAbs(
            curveContract.realUsdc(),
            99 * 10 ** 6,
            1 * 10 ** 6, // 1 USDC tolerance for rounding
            "real USDC ~99"
        );

        // Fees accrued: 1 USDC total, 0.5 creator + 0.5 protocol.
        assertApproxEqAbs(curveContract.creatorFeesAccrued(), 0.5 * 10 ** 6, 1, "creator fees ~0.5");
        assertApproxEqAbs(curveContract.protocolFeesAccrued(), 0.5 * 10 ** 6, 1, "protocol fees ~0.5");

        // Market cap increased (use approximate comparison for precision).
        assertGt(curveContract.marketCap(), 4_000 * 10 ** 6, "market cap increased after buy");
    }

    /// @notice Test: sell tokens, verify curve math and fee accrual.
    function test_Sell() public {
        launchToken();

        uint256 tokensOut = buy(buyer1, 100 * 10 ** 6);
        uint256 buyerUsdcBefore = usdc.balanceOf(buyer1);

        vm.startPrank(buyer1);
        tokenContract.approve(curve, type(uint256).max);
        uint256 usdcOut = curveContract.sell(tokensOut, 0);
        vm.stopPrank();

        assertGt(usdcOut, 0, "usdc out > 0");
        assertEq(usdc.balanceOf(buyer1) - buyerUsdcBefore, usdcOut, "seller received USDC");
        // Seller gets back less than they put in (fees + curve slippage).
        assertLt(usdcOut, 100 * 10 ** 6, "seller gets less than input due to fees");
    }

    /// @notice BuyV2 and SellV2 expose authoritative gross, fee, net, and output values.
    function test_AccountingEventsAreExplicit() public {
        launchToken();

        vm.recordLogs();
        uint256 tokensOut = buy(buyer1, 100 * 10 ** 6);
        Vm.Log[] memory buyLogs = vm.getRecordedLogs();
        bytes32 buyTopic = keccak256("BuyV2(address,uint256,uint256,uint256,uint256,uint256)");
        bool foundBuy;
        for (uint256 i = 0; i < buyLogs.length; i++) {
            if (buyLogs[i].emitter == curve && buyLogs[i].topics[0] == buyTopic) {
                (uint256 gross, uint256 fee, uint256 net, uint256 emittedTokens,) =
                    abi.decode(buyLogs[i].data, (uint256, uint256, uint256, uint256, uint256));
                assertEq(gross, 100 * 10 ** 6, "buy gross");
                assertEq(fee, 1 * 10 ** 6, "buy fee");
                assertEq(net, 99 * 10 ** 6, "buy curve amount");
                assertEq(emittedTokens, tokensOut, "buy token output");
                foundBuy = true;
            }
        }
        assertTrue(foundBuy, "BuyV2 event missing");

        vm.startPrank(buyer1);
        tokenContract.approve(curve, tokensOut);
        vm.recordLogs();
        uint256 usdcOut = curveContract.sell(tokensOut, 0);
        Vm.Log[] memory sellLogs = vm.getRecordedLogs();
        vm.stopPrank();

        bytes32 sellTopic = keccak256("SellV2(address,uint256,uint256,uint256,uint256,uint256)");
        bool foundSell;
        for (uint256 i = 0; i < sellLogs.length; i++) {
            if (sellLogs[i].emitter == curve && sellLogs[i].topics[0] == sellTopic) {
                (uint256 emittedTokens, uint256 gross, uint256 fee, uint256 net,) =
                    abi.decode(sellLogs[i].data, (uint256, uint256, uint256, uint256, uint256));
                assertEq(emittedTokens, tokensOut, "sell token input");
                assertEq(gross - fee, net, "sell gross less fee");
                assertEq(net, usdcOut, "sell net output");
                foundSell = true;
            }
        }
        assertTrue(foundSell, "SellV2 event missing");
    }

    /// @notice Test: slippage protection — buy reverts if minTokensOut not met.
    function test_SlippageProtection_Buy() public {
        launchToken();
        uint256 expected = curveContract.quoteBuy(100 * 10 ** 6);

        vm.startPrank(buyer1);
        usdc.approve(curve, type(uint256).max);
        // Set minTokensOut higher than actual → should revert.
        vm.expectRevert();
        curveContract.buy(100 * 10 ** 6, expected + 1);
        vm.stopPrank();
    }

    /// @notice Test: slippage protection — sell reverts if minUsdcOut not met.
    function test_SlippageProtection_Sell() public {
        launchToken();
        uint256 tokensOut = buy(buyer1, 100 * 10 ** 6);
        uint256 expected = curveContract.quoteSell(tokensOut);

        vm.startPrank(buyer1);
        tokenContract.approve(curve, type(uint256).max);
        vm.expectRevert();
        curveContract.sell(tokensOut, expected + 1);
        vm.stopPrank();
    }

    /// @notice Test: one wallet may hold more than the legacy 4% threshold.
    function test_BuyAboveLegacyMaxWalletSucceeds() public {
        launchToken();
        uint256 tokensOut = buy(buyer1, 500 * 10 ** 6);
        assertGt(tokensOut, 40_000_000 * 10 ** 18, "buy exceeds legacy 4% threshold");
        assertEq(tokenContract.balanceOf(buyer1), tokensOut, "buyer receives uncapped amount");
    }

    /// @notice Test: cooldown — rapid transfers revert.
    function test_Cooldown() public {
        launchToken();
        uint256 tokensOut = buy(buyer1, 50 * 10 ** 6);

        // First transfer (no cooldown yet — lastTxBlock is 0).
        vm.startPrank(buyer1);
        tokenContract.transfer(buyer2, tokensOut / 2);
        vm.stopPrank();

        // Second transfer in same block → cooldown active.
        vm.startPrank(buyer1);
        vm.expectRevert(); // CooldownActive
        tokenContract.transfer(buyer2, tokensOut / 2);
        vm.stopPrank();

        // Wait COOLDOWN_BLOCKS blocks.
        vm.roll(block.number + 31);

        // Now transfer succeeds.
        vm.startPrank(buyer1);
        tokenContract.transfer(buyer2, tokensOut / 2);
        vm.stopPrank();
    }

    /// @notice Test: no mint function — total supply never increases post-deploy.
    function test_NoMint() public {
        launchToken();
        uint256 supplyBefore = tokenContract.totalSupply();

        // Try to call _mint via a crafted call — should fail (no public mint).
        // The only mint is in constructor, which already ran.
        // Verify supply unchanged after trades.
        buy(buyer1, 100 * 10 ** 6);
        assertEq(tokenContract.totalSupply(), supplyBefore, "supply unchanged after buy");

        vm.startPrank(buyer1);
        tokenContract.approve(curve, type(uint256).max);
        curveContract.sell(tokenContract.balanceOf(buyer1), 0);
        vm.stopPrank();
        assertEq(tokenContract.totalSupply(), supplyBefore, "supply unchanged after sell");
    }

    /// @notice Test: creator can claim accrued fees.
    function test_ClaimCreatorFees() public {
        launchToken();
        buy(buyer1, 100 * 10 ** 6); // 1 USDC fee, 0.5 to creator

        uint256 creatorUsdcBefore = usdc.balanceOf(creator);
        vm.prank(creator);
        curveContract.claimCreatorFees();

        assertGt(usdc.balanceOf(creator), creatorUsdcBefore, "creator received fees");
        assertEq(curveContract.creatorFeesAccrued(), 0, "fees reset to 0");
    }

    /// @notice Test: protocol owner can claim accrued fees.
    function test_ClaimProtocolFees() public {
        launchToken();
        buy(buyer1, 100 * 10 ** 6);

        uint256 treasuryUsdcBefore = usdc.balanceOf(address(treasury));
        vm.prank(address(treasury));
        curveContract.claimProtocolFees();

        assertGt(usdc.balanceOf(address(treasury)), treasuryUsdcBefore, "treasury received fees");
    }

    /// @notice Test: AMM pair creation and basic swap.
    function test_AMM_CreateAndSwap() public {
        // Deploy a token + USDC pair.
        launchToken();

        // Buy tokens from the curve (under max-wallet limit: 4% = 40M tokens).
        // At ~$4K market cap, $150 USDC buys ~37M tokens (under 40M limit).
        uint256 tokensForLiq = buy(address(this), 150 * 10 ** 6);

        // Create pair.
        address pair = ammFactory.createPair(token, USDC);
        assertTrue(pair != address(0), "pair created");

        // Add liquidity: 100 USDC + half the bought tokens.
        uint256 liqUsdc = 100 * 10 ** 6;
        uint256 liqTokens = tokensForLiq / 2;
        usdc.transfer(pair, liqUsdc);
        tokenContract.transfer(pair, liqTokens);
        uint256 lp = AMMPair(pair).mint(address(this));
        assertGt(lp, 0, "LP minted");

        // Swap: 10 USDC for tokens.
        (uint112 reserve0, uint112 reserve1,) = AMMPair(pair).getReserves();
        bool usdcIsToken0 = USDC < token;
        uint256 usdcReserve = usdcIsToken0 ? reserve0 : reserve1;
        uint256 tokenReserve = usdcIsToken0 ? reserve1 : reserve0;

        uint256 swapAmount = 10 * 10 ** 6;
        usdc.transfer(pair, swapAmount);
        uint256 expectedOut = (swapAmount * tokenReserve) / (usdcReserve + swapAmount);
        if (usdcIsToken0) {
            AMMPair(pair).swap(0, expectedOut, address(this));
        } else {
            AMMPair(pair).swap(expectedOut, 0, address(this));
        }

        assertGt(tokenContract.balanceOf(address(this)), liqTokens, "received tokens from swap");
    }

    /// @notice Test: full lifecycle — create → buy → sell → graduate.
    function test_FullLifecycle() public {
        launchToken();

        // Unrelated balances already held by the migrator must never be swept
        // into this token's AMM liquidity.
        uint256 donatedUsdc = 7 * 10 ** 6;
        uint256 donatedTokens = 1 * 10 ** 18;
        usdc.transfer(address(migrator), donatedUsdc);
        buy(buyer1, 10 * 10 ** 6);
        vm.prank(buyer1);
        tokenContract.transfer(address(migrator), donatedTokens);

        // Buy from many wallets (max-wallet limits each to 4% = 40M tokens).
        // $100 USDC per wallet is always under max-wallet at any price point:
        //   - At $4K mcap: $100 buys ~25M tokens (< 40M limit ✓)
        //   - At $25K mcap: $100 buys ~4M tokens (< 40M limit ✓)
        // Need ~$8,800 USDC total to reach graduation → 100 wallets at $100 = $10K.
        for (uint256 i = 0; i < 100 && !curveContract.graduated(); i++) {
            address w = address(uint160(0x20000 + i));
            usdc.mint(w, 200 * 10 ** 6);

            vm.startPrank(w);
            usdc.approve(curve, type(uint256).max);
            try curveContract.buy(100 * 10 ** 6, 0) {
                // Success.
            } catch {
                // Buy might fail near graduation (partial fill) — that's fine.
            }
            vm.stopPrank();
        }

        // Trigger graduation via migrator.
        migrator.checkAndMigrate(token);

        assertEq(usdc.balanceOf(address(migrator)), donatedUsdc, "donated USDC preserved");
        assertEq(tokenContract.balanceOf(address(migrator)), donatedTokens, "donated tokens preserved");

        // Verify graduated.
        assertTrue(curveContract.graduated(), "curve graduated");
        assertTrue(tokenContract.graduated(), "token graduated");

        // Verify AMM pair created.
        address pair = migrator.getAmmPair(token);
        assertTrue(pair != address(0), "AMM pair created");

        // Verify LP burned to 0x...dEaD.
        uint256 burnBalance = AMMPair(pair).balanceOf(0x000000000000000000000000000000000000dEaD);
        assertGt(burnBalance, 0, "LP burned to 0x...dEaD");

        // Verify token ownership renounced.
        assertEq(tokenContract.owner(), address(0), "ownership renounced");

        // Verify token marked graduated in factory.
        TokenFactory.LaunchToken memory lt = factory.getToken(token);
        assertTrue(lt.graduated, "factory marked graduated");
    }

    /// @notice Test: migration reverts on non-graduated token.
    function test_FailedMigration_Reverts() public {
        launchToken(); // fresh token, not graduated, market cap ~$4K
        vm.expectRevert(); // NotGraduated
        migrator.checkAndMigrate(token);
    }

    /// @notice Test: creation fee is charged and goes to treasury.
    function test_CreationFee() public {
        uint256 treasuryBefore = usdc.balanceOf(address(treasury));
        launchToken();
        uint256 treasuryAfter = usdc.balanceOf(address(treasury));

        // Creation fee = 5 USDC.
        assertEq(treasuryAfter - treasuryBefore, 5 * 10 ** 6, "creation fee to treasury");
    }

    function test_FactoryRequiresContractTreasury() public {
        vm.expectRevert(TokenFactory.InvalidAddress.selector);
        new TokenFactory(address(0));
        vm.expectRevert(TokenFactory.InvalidAddress.selector);
        new TokenFactory(address(0x1234));
    }

    function test_FactoryRequiresMigratorBeforeLaunch() public {
        TokenFactory unconfigured = new TokenFactory(address(treasury));
        vm.prank(creator);
        vm.expectRevert(TokenFactory.MigratorNotConfigured.selector);
        unconfigured.createToken("Test", "TST", "ipfs://img", "desc");
    }

    function test_FactoryRejectsInvalidAdminConfiguration() public {
        vm.expectRevert(TokenFactory.InvalidAddress.selector);
        factory.setTreasury(address(0));
        vm.expectRevert(TokenFactory.InvalidAddress.selector);
        factory.setMigrator(address(0x1234));
        uint256 excessiveFee = factory.MAX_CREATION_FEE() + 1;
        vm.expectRevert(TokenFactory.FeeTooHigh.selector);
        factory.setCreationFee(excessiveFee);
    }

    /// @notice Test: factory pause prevents new launches.
    function test_FactoryPause() public {
        factory.pause();
        assertTrue(factory.paused(), "factory paused");

        vm.startPrank(creator);
        usdc.approve(address(factory), type(uint256).max);
        vm.expectRevert(); // FactoryPaused
        factory.createToken("Test", "TST", "ipfs://img", "desc");
        vm.stopPrank();
    }

    /// @notice Test: getCreatorTokens pagination.
    function test_GetCreatorTokens_Pagination() public {
        // Launch 3 tokens as creator.
        vm.startPrank(creator);
        usdc.approve(address(factory), type(uint256).max);
        factory.createToken("Token1", "T1", "ipfs://1", "d1");
        factory.createToken("Token2", "T2", "ipfs://2", "d2");
        factory.createToken("Token3", "T3", "ipfs://3", "d3");
        vm.stopPrank();

        // Get first 2.
        address[] memory page1 = factory.getCreatorTokens(creator, 0, 2);
        assertEq(page1.length, 2, "page1 length");

        // Get next 2 (only 1 left).
        address[] memory page2 = factory.getCreatorTokens(creator, 2, 2);
        assertEq(page2.length, 1, "page2 length");

        // Out of bounds.
        address[] memory page3 = factory.getCreatorTokens(creator, 10, 2);
        assertEq(page3.length, 0, "page3 empty");
    }
}
