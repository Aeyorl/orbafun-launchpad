#!/usr/bin/env node
/**
 * Bonding Curve Economics Model
 *
 * Simulates a full token lifecycle on a constant-product bonding curve
 * to verify the economics before writing contract code.
 *
 * Model: constant-product (x*y=k) with virtual reserves, like pump.fun/Orba.
 * - Virtual USDC reserve + real USDC collected = x
 * - Virtual token reserve - tokens sold = y
 * - k = virtual_usdc * virtual_tokens (constant)
 * - price = x / y (USDC per token)
 * - market_cap = price * total_supply
 *
 * Usage:
 *   node scripts/bonding-curve-model.js           # default params (Orba-like)
 *   node scripts/bonding-curve-model.js --help     # see all options
 */

// ─── Parameters (Orba-derived defaults, adjustable) ───────────────────────

const PARAMS = {
  totalSupply: 1_000_000_000,       // 1B tokens total
  supplyOnCurvePct: 88,             // % of supply sold through curve (rest reserved for DEX)
  virtualUsdcReserve: 5866.67,      // virtual USDC (sets initial price)
  virtualTokenReserve: 1_466_666_667, // virtual tokens (curve shape)
  graduationMarketCap: 25_000,      // market cap at which graduation triggers (USDC)
  feePct: 1,                        // trading fee % (0.5% creator + 0.5% protocol)
  creatorFeeShare: 0.5,             // creator gets 50% of fees
  protocolFeeShare: 0.5,            // protocol gets 50% of fees
  lpSeedUsdc: 8500,                 // USDC used to seed DEX liquidity on graduation
  // Simulation: simulate a series of buys to reach graduation
  simBuySizeUsdc: 100,              // each simulated buy is this many USDC
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmt(n, decimals = 2) {
  if (typeof n !== 'number' || !isFinite(n)) return String(n);
  return n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

// ─── Curve math ─────────────────────────────────────────────────────────────

class BondingCurve {
  constructor(params) {
    this.params = params;
    this.supplyOnCurve = Math.floor(params.totalSupply * params.supplyOnCurvePct / 100);
    this.supplyReserved = params.totalSupply - this.supplyOnCurve;

    this.virtualUsdc = params.virtualUsdcReserve;
    this.virtualTokens = params.virtualTokenReserve;
    this.k = this.virtualUsdc * this.virtualTokens;

    // State
    this.realUsdc = 0;           // USDC collected (net of fees)
    this.tokensSold = 0;          // tokens bought from curve (outstanding)
    this.creatorFees = 0;
    this.protocolFees = 0;
    this.totalVolume = 0;

    // Track: x = virtualUsdc + realUsdc, y = virtualTokens - tokensSold
    // But tokensSold can't exceed supplyOnCurve
  }

  get x() { return this.virtualUsdc + this.realUsdc; }
  get y() { return this.virtualTokens - this.tokensSold; }
  get price() { return this.x / this.y; }  // USDC per token
  get marketCap() { return this.price * this.params.totalSupply; }
  get tokensRemainingOnCurve() { return this.supplyOnCurve - this.tokensSold; }

  // Buy: spend `usdcIn` USDC, get tokens out (after fee)
  buy(usdcIn) {
    const fee = usdcIn * this.params.feePct / 100;
    const usdcToCurve = usdcIn - fee;

    const oldX = this.x;
    const newX = oldX + usdcToCurve;
    const newY = this.k / newX;
    const tokensOut = this.y - newY;

    // Check we don't exceed supply
    if (this.tokensSold + tokensOut > this.supplyOnCurve) {
      // Partial fill — only sell remaining tokens
      const tokensRemaining = this.supplyOnCurve - this.tokensSold;
      if (tokensRemaining <= 0) return { tokensOut: 0, usdcIn, fee, partial: true, graduated: true };

      // How much USDC buys the remaining tokens?
      // y_final = virtualTokens - supplyOnCurve
      // x_final = k / y_final
      // usdcToCurve_needed = x_final - oldX
      const yFinal = this.virtualTokens - this.supplyOnCurve;
      const xFinal = this.k / yFinal;
      const usdcToCurveNeeded = xFinal - oldX;
      const usdcInNeeded = usdcToCurveNeeded / (1 - this.params.feePct / 100);
      const feeNeeded = usdcInNeeded - usdcToCurveNeeded;

      this.realUsdc += usdcToCurveNeeded;
      this.tokensSold = this.supplyOnCurve;
      this.creatorFees += feeNeeded * this.params.creatorFeeShare;
      this.protocolFees += feeNeeded * this.params.protocolFeeShare;
      this.totalVolume += usdcInNeeded;

      return {
        tokensOut: tokensRemaining,
        usdcIn: usdcInNeeded,
        usdcRefunded: usdcIn - usdcInNeeded,
        fee: feeNeeded,
        partial: true,
        graduated: true,
      };
    }

    this.realUsdc += usdcToCurve;
    this.tokensSold += tokensOut;
    this.creatorFees += fee * this.params.creatorFeeShare;
    this.protocolFees += fee * this.params.protocolFeeShare;
    this.totalVolume += usdcIn;

    return { tokensOut, usdcIn, fee, partial: false, graduated: this.tokensSold >= this.supplyOnCurve };
  }

  // Sell: return `tokenAmount` tokens, get USDC out (after fee)
  sell(tokenAmount) {
    const oldY = this.y;
    const newY = oldY + tokenAmount;
    const newX = this.k / newY;
    const usdcGross = this.x - newX;

    const fee = usdcGross * this.params.feePct / 100;
    const usdcOut = usdcGross - fee;

    this.realUsdc -= usdcGross;
    this.tokensSold -= tokenAmount;
    this.creatorFees += fee * this.params.creatorFeeShare;
    this.protocolFees += fee * this.params.protocolFeeShare;
    this.totalVolume += usdcGross;

    return { usdcOut, fee, usdcGross };
  }

  // Quote: how many tokens for `usdcIn` USDC (no state change)
  quoteBuy(usdcIn) {
    const fee = usdcIn * this.params.feePct / 100;
    const usdcToCurve = usdcIn - fee;
    const oldX = this.x;
    const newX = oldX + usdcToCurve;
    const newY = this.k / newX;
    return this.y - newY;
  }

  // Quote: how much USDC for `tokenAmount` tokens (no state change)
  quoteSell(tokenAmount) {
    const oldY = this.y;
    const newY = oldY + tokenAmount;
    const newX = this.k / newY;
    const usdcGross = this.x - newX;
    const fee = usdcGross * this.params.feePct / 100;
    return usdcGross - fee;
  }
}

// ─── Simulation ─────────────────────────────────────────────────────────────

function simulate(params) {
  console.log('═'.repeat(80));
  console.log('  BONDING CURVE ECONOMICS MODEL');
  console.log('═'.repeat(80));
  console.log();

  // ─── Parameters ─────────
  console.log('─ PARAMETERS ─────────────────────────────────────────────────────────────');
  console.log(`  Total supply:           ${fmt(params.totalSupply, 0)} tokens`);
  console.log(`  Supply on curve:        ${params.supplyOnCurvePct}% (${fmt(params.totalSupply * params.supplyOnCurvePct / 100, 0)} tokens)`);
  console.log(`  Supply reserved (DEX):  ${100 - params.supplyOnCurvePct}% (${fmt(params.totalSupply * (100 - params.supplyOnCurvePct) / 100, 0)} tokens)`);
  console.log(`  Virtual USDC reserve:   ${fmt(params.virtualUsdcReserve)} USDC`);
  console.log(`  Virtual token reserve:  ${fmt(params.virtualTokenReserve, 0)} tokens`);
  console.log(`  Graduation threshold:   ${fmt(params.graduationMarketCap, 0)} USDC market cap`);
  console.log(`  Trading fee:            ${params.feePct}% (${params.creatorFeeShare * 100}% creator / ${params.protocolFeeShare * 100}% protocol)`);
  console.log(`  LP seed on graduation:  ${fmt(params.lpSeedUsdc, 0)} USDC`);
  console.log();

  const curve = new BondingCurve(params);

  // ─── Initial state ─────────
  console.log('─ INITIAL STATE ───────────────────────────────────────────────────────────');
  console.log(`  k (constant):           ${fmt(curve.k, 2)}`);
  console.log(`  Initial price:          ${curve.price.toExponential(6)} USDC/token`);
  console.log(`  Initial market cap:     ${fmt(curve.marketCap, 2)} USDC`);
  console.log(`  Tokens on curve:        ${fmt(curve.supplyOnCurve, 0)}`);
  console.log(`  Tokens reserved:        ${fmt(curve.supplyReserved, 0)}`);
  console.log();

  // ─── Graduation analysis ─────────
  // At graduation: all supplyOnCurve tokens are sold
  // y_final = virtualTokens - supplyOnCurve
  // x_final = k / y_final
  // realUsdc_final = x_final - virtualUsdc
  // price_final = x_final / y_final
  // marketCap_final = price_final * totalSupply
  const yFinal = params.virtualTokenReserve - curve.supplyOnCurve;
  const xFinal = curve.k / yFinal;
  const realUsdcFinal = xFinal - params.virtualUsdcReserve;
  const priceFinal = xFinal / yFinal;
  const marketCapFinal = priceFinal * params.totalSupply;

  console.log('─ GRADUATION ANALYSIS ──────────────────────────────────────────────────────');
  console.log(`  Tokens remaining on curve at graduation: ${fmt(curve.supplyOnCurve, 0)} → 0`);
  console.log(`  Virtual tokens remaining:               ${fmt(yFinal, 0)}`);
  console.log(`  USDC reserve at graduation:             ${fmt(xFinal, 2)} USDC (virtual + real)`);
  console.log(`  Real USDC collected:                    ${fmt(realUsdcFinal, 2)} USDC`);
  console.log(`  Price at graduation:                    ${priceFinal.toExponential(6)} USDC/token`);
  console.log(`  Market cap at graduation:               ${fmt(marketCapFinal, 2)} USDC`);
  console.log();

  // Check: does graduation market cap match our threshold?
  const marketCapMatch = Math.abs(marketCapFinal - params.graduationMarketCap) < 1;
  console.log(`  ✓ Graduation market cap matches threshold: ${marketCapMatch ? 'YES' : 'NO (' + fmt(marketCapFinal, 2) + ' vs ' + fmt(params.graduationMarketCap, 0) + ')'}`);
  console.log();

  // ─── LP migration analysis ─────────
  const lpUsdc = Math.min(realUsdcFinal, params.lpSeedUsdc);
  const lpTokens = curve.supplyReserved;
  const lpTokenValueAtGraduation = lpTokens * priceFinal;

  console.log('─ LP MIGRATION (GRADUATION) ────────────────────────────────────────────────');
  console.log(`  USDC to DEX pool:        ${fmt(lpUsdc, 2)} USDC`);
  console.log(`  Tokens to DEX pool:      ${fmt(lpTokens, 0)} tokens (${100 - params.supplyOnCurvePct}% of supply)`);
  console.log(`  Token value at grad:     ${fmt(lpTokenValueAtGraduation, 2)} USDC`);
  console.log(`  Pool ratio:              ${fmt(lpUsdc, 2)} USDC / ${fmt(lpTokens, 0)} tokens`);
  console.log(`  Implied DEX price:       ${(lpUsdc / lpTokens).toExponential(6)} USDC/token`);
  console.log(`  Price match to curve:    ${Math.abs(lpUsdc / lpTokens - priceFinal) < priceFinal * 0.01 ? 'YES (within 1%)' : 'NO — MISMATCH'}`);
  console.log();

  // ─── Remaining USDC after LP seed ─────────
  const remainingUsdc = realUsdcFinal - lpUsdc;
  console.log(`  USDC remaining after LP seed: ${fmt(remainingUsdc, 2)} USDC`);
  if (remainingUsdc > 0) {
    console.log(`    → Goes to: protocol treasury (or creator, depending on design)`);
  }
  console.log();

  // ─── Fee projection ─────────
  // Simulate buys to graduation to estimate total fees
  console.log('─ FEE PROJECTION (simulated buys to graduation) ───────────────────────────');
  const simCurve = new BondingCurve(params);
  let buyCount = 0;
  const buyLog = [];

  while (simCurve.tokensSold < simCurve.supplyOnCurve && buyCount < 10000) {
    const result = simCurve.buy(params.simBuySizeUsdc);
    buyCount++;
    if (buyCount <= 5 || buyCount % 50 === 0 || result.graduated) {
      buyLog.push({
        buy: buyCount,
        usdcIn: result.usdcIn,
        tokensOut: result.tokensOut,
        price: simCurve.price,
        marketCap: simCurve.marketCap,
        tokensSold: simCurve.tokensSold,
        pctSold: (simCurve.tokensSold / simCurve.supplyOnCurve * 100),
        creatorFees: simCurve.creatorFees,
        protocolFees: simCurve.protocolFees,
      });
    }
    if (result.graduated) break;
  }

  console.log(`  Simulated ${buyCount} buys of ${fmt(params.simBuySizeUsdc, 0)} USDC each to reach graduation`);
  console.log();
  console.log('  Buy# |   USDC In |     Tokens Out |       Price |  Market Cap |  % Sold | Creator Fees | Protocol Fees');
  console.log('  -----|-----------|----------------|-------------|-------------|---------|--------------|--------------');
  for (const log of buyLog) {
    console.log(
      `  ${String(log.buy).padStart(4)} |` +
      ` ${fmt(log.usdcIn, 0).padStart(9)} |` +
      ` ${fmt(log.tokensOut, 0).padStart(14)} |` +
      ` ${log.price.toExponential(4).padStart(11)} |` +
      ` ${fmt(log.marketCap, 0).padStart(11)} |` +
      ` ${fmt(log.pctSold, 1).padStart(6)}% |` +
      ` ${fmt(log.creatorFees, 4).padStart(12)} |` +
      ` ${fmt(log.protocolFees, 4).padStart(12)}`
    );
  }
  console.log();

  console.log(`  Total volume (buys only):  ${fmt(simCurve.totalVolume, 2)} USDC`);
  console.log(`  Creator fees accrued:      ${fmt(simCurve.creatorFees, 4)} USDC`);
  console.log(`  Protocol fees accrued:     ${fmt(simCurve.protocolFees, 4)} USDC`);
  console.log(`  Total fees:                ${fmt(simCurve.creatorFees + simCurve.protocolFees, 4)} USDC`);
  console.log();

  // ─── Time-to-graduation estimate ─────────
  console.log('─ TIME-TO-GRADUATION ESTIMATE ───────────────────────────────────────────────');
  const scenarios = [
    { label: 'Slow (5 buys/hr)', buysPerHour: 5 },
    { label: 'Moderate (20 buys/hr)', buysPerHour: 20 },
    { label: 'Fast (50 buys/hr)', buysPerHour: 50 },
    { label: 'Viral (200 buys/hr)', buysPerHour: 200 },
  ];
  for (const s of scenarios) {
    const hours = buyCount / s.buysPerHour;
    const mins = hours * 60;
    if (hours < 1) {
      console.log(`  ${s.label.padEnd(25)} → ${fmt(mins, 0)} minutes`);
    } else if (hours < 24) {
      console.log(`  ${s.label.padEnd(25)} → ${fmt(hours, 1)} hours`);
    } else {
      console.log(`  ${s.label.padEnd(25)} → ${fmt(hours / 24, 1)} days`);
    }
  }
  console.log();

  // ─── Post-graduation DEX depth ─────────
  console.log('─ POST-GRADUATION DEX (AMM) DEPTH ──────────────────────────────────────────');
  const dexUsdc = lpUsdc;
  const dexTokens = lpTokens;
  const dexK = dexUsdc * dexTokens;
  const dexPrice = dexUsdc / dexTokens;

  // Simulate a 1000 USDC swap on the DEX to check slippage
  const swapUsdc = 1000;
  const dexXAfter = dexUsdc + swapUsdc;
  const dexYAfter = dexK / dexXAfter;
  const tokensOut = dexTokens - dexYAfter;
  const slippagePct = (1 - tokensOut * dexPrice / swapUsdc) * 100;

  console.log(`  DEX pool: ${fmt(dexUsdc, 2)} USDC / ${fmt(dexTokens, 0)} tokens`);
  console.log(`  DEX initial price: ${dexPrice.toExponential(6)} USDC/token`);
  console.log(`  DEX k: ${fmt(dexK, 2)}`);
  console.log();
  console.log(`  Slippage test: ${fmt(swapUsdc, 0)} USDC swap`);
  console.log(`    Tokens out: ${fmt(tokensOut, 0)}`);
  console.log(`    Effective price: ${(swapUsdc / tokensOut).toExponential(6)} USDC/token`);
  console.log(`    Slippage: ${fmt(slippagePct, 2)}%`);
  if (slippagePct > 10) {
    console.log(`    ⚠️  HIGH SLIPPAGE — DEX liquidity too thin for ${fmt(swapUsdc, 0)} USDC swaps`);
    console.log(`        Consider: increase LP seed, or increase reserved token %`);
  } else if (slippagePct > 5) {
    console.log(`    ⚠️  Moderate slippage — may deter larger trades`);
  } else {
    console.log(`    ✓ Slippage acceptable for ${fmt(swapUsdc, 0)} USDC swaps`);
  }
  console.log();

  // ─── Summary & verdict ─────────
  console.log('═'.repeat(80));
  console.log('  SUMMARY & VERDICT');
  console.log('═'.repeat(80));
  console.log();
  const issues = [];
  if (!marketCapMatch) issues.push(`Graduation market cap (${fmt(marketCapFinal, 0)}) doesn't match threshold (${fmt(params.graduationMarketCap, 0)})`);
  if (Math.abs(lpUsdc / lpTokens - priceFinal) > priceFinal * 0.01) issues.push('DEX price mismatch at graduation (causes arbitrage dump)');
  if (slippagePct > 10) issues.push(`DEX slippage too high (${fmt(slippagePct, 1)}% for ${fmt(swapUsdc, 0)} USDC swap)`);
  if (remainingUsdc < 0) issues.push('Not enough USDC collected to seed LP');
  if (realUsdcFinal < params.lpSeedUsdc) issues.push(`USDC collected (${fmt(realUsdcFinal, 0)}) < LP seed needed (${fmt(params.lpSeedUsdc, 0)})`);

  if (issues.length === 0) {
    console.log('  ✓ Economics model is sound. All checks pass.');
  } else {
    console.log('  ⚠️  ISSUES FOUND:');
    for (const issue of issues) {
      console.log(`    • ${issue}`);
    }
  }
  console.log();
  console.log(`  Graduation raises:       ${fmt(realUsdcFinal, 2)} USDC`);
  console.log(`  LP seeded:               ${fmt(lpUsdc, 2)} USDC + ${fmt(lpTokens, 0)} tokens`);
  console.log(`  Creator earns:           ${fmt(simCurve.creatorFees, 2)} USDC (from buy fees only)`);
  console.log(`  Protocol earns:          ${fmt(simCurve.protocolFees, 2)} USDC (from buy fees only)`);
  console.log(`  Remaining USDC:          ${fmt(remainingUsdc, 2)} USDC → treasury`);
  console.log(`  Buys to graduation:      ${buyCount} (at ${fmt(params.simBuySizeUsdc, 0)} USDC/buy)`);
  console.log();
  console.log('═'.repeat(80));
}

// ─── CLI ────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log('Bonding Curve Economics Model');
  console.log();
  console.log('Usage: node scripts/bonding-curve-model.js [options]');
  console.log();
  console.log('Options (override defaults):');
  console.log('  --supply <n>         Total token supply (default: 1,000,000,000)');
  console.log('  --on-curve <pct>     % of supply on curve (default: 88)');
  console.log('  --vusdc <n>          Virtual USDC reserve (default: 5866.67)');
  console.log('  --vtokens <n>        Virtual token reserve (default: 1466666667)');
  console.log('  --grad-mcap <n>      Graduation market cap threshold (default: 25000)');
  console.log('  --fee <pct>          Trading fee % (default: 1)');
  console.log('  --lp-seed <n>        USDC to seed DEX on graduation (default: 8500)');
  console.log('  --buy-size <n>       Simulated buy size in USDC (default: 100)');
  process.exit(0);
}

function parseArg(name, type = 'number') {
  const idx = args.indexOf(name);
  if (idx === -1 || idx + 1 >= args.length) return undefined;
  const val = args[idx + 1];
  return type === 'number' ? parseFloat(val) : val;
}

const overrides = {};
const supply = parseArg('--supply');
if (supply) overrides.totalSupply = supply;
const onCurve = parseArg('--on-curve');
if (onCurve) overrides.supplyOnCurvePct = onCurve;
const vusdc = parseArg('--vusdc');
if (vusdc) overrides.virtualUsdcReserve = vusdc;
const vtokens = parseArg('--vtokens');
if (vtokens) overrides.virtualTokenReserve = vtokens;
const gradMcap = parseArg('--grad-mcap');
if (gradMcap) overrides.graduationMarketCap = gradMcap;
const fee = parseArg('--fee');
if (fee) overrides.feePct = fee;
const lpSeed = parseArg('--lp-seed');
if (lpSeed) overrides.lpSeedUsdc = lpSeed;
const buySize = parseArg('--buy-size');
if (buySize) overrides.simBuySizeUsdc = buySize;

simulate({ ...PARAMS, ...overrides });
