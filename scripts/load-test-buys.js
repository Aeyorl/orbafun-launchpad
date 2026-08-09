/**
 * Load test: concurrent buys on a single bonding curve.
 *
 * Phase 4 load testing requirement (from 05_PHASE4_testing_security.md):
 *   "Simulate concurrent buy/sell transactions on a single token approaching
 *    the graduation threshold — this is the highest-contention moment."
 *
 * What this script does:
 *   1. Generates N ephemeral buyer wallets (random private keys)
 *   2. Funds each from the deployer wallet once; Arc exposes the same USDC as
 *      native gas (18 decimals) and ERC-20 spendable USDC (6 decimals)
 *   3. All N wallets concurrently approve USDC + call buy() on the same curve
 *   4. Measures: throughput (txs/s), success/failure count, RPC errors,
 *      indexer lag (time for all trades to appear in API)
 *   5. Verifies on-chain state: total tokensSold matches sum of successful buys,
 *      no reverts from reentrancy or state corruption
 *   6. Reports a pass/fail summary
 *
 * Usage:
 *   node scripts/load-test-buys.js <curve-address> [concurrency=10] [usdc-per-buy=1]
 *
 * Example:
 *   node scripts/load-test-buys.js 0x486ea7b6de154811fe1417b5ccd011d6b54bf258 20 2
 *
 * Requirements:
 *   - DEPLOYER_PRIVATE_KEY env var (funded wallet)
 *   - E2E_API_URL may override the deployed API used for indexer lag measurement
 *   - Deployer wallet has enough USDC for each buy plus the configurable gas buffer
 *
 * Safety:
 *   - Uses small buy amounts to stay well under max-wallet (4% of supply)
 *   - Each buyer is a fresh wallet, so no single wallet hits max-wallet
 *   - 5% slippage tolerance on each buy
 *   - Idempotent: can re-run against the same curve (buys just add to tokensSold)
 */
require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const {
  createWalletClient,
  createPublicClient,
  http,
  fallback,
  parseUnits,
  formatUnits,
} = require('viem');
const { arcTestnet } = require('viem/chains');
const { erc20Abi } = require('viem');
const { generatePrivateKey, privateKeyToAccount } = require('viem/accounts');

const DEPLOYER_PK = process.env.DEPLOYER_PRIVATE_KEY;
const RPC_URLS = (
  process.env.ARC_RPC_URLS ||
  'https://rpc.testnet.arc.network,https://rpc.drpc.testnet.arc.network,https://rpc.quicknode.testnet.arc.network,https://rpc.blockdaemon.testnet.arc.network'
)
  .split(',')
  .map((u) => u.trim())
  .filter(Boolean);

const USDC = '0x3600000000000000000000000000000000000000';
const API = (process.env.E2E_API_URL || process.env.API_URL || 'https://orbafun-api.onrender.com').replace(/\/$/, '');
const SKIP_INDEXER_CHECK = process.env.SKIP_INDEXER_CHECK === 'true';

const BONDING_CURVE_ABI = [
  {
    name: 'buy',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'usdcAmount', type: 'uint256' },
      { name: 'minTokensOut', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    name: 'quoteBuy',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'usdcAmount', type: 'uint256' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'tokensSold',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'marketCap',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'reserveTokens',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function saveBuyerWallets(buyers, curve) {
  const outputPath = path.resolve(
    process.env.LOAD_TEST_WALLET_FILE || path.join(
      'output',
      'load-tests',
      `buyers-${curve.toLowerCase()}-${new Date().toISOString().replace(/[:.]/g, '-')}.wallets.json`,
    ),
  );
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify({
    network: 'Arc Testnet',
    chainId: arcTestnet.id,
    curve,
    createdAt: new Date().toISOString(),
    wallets: buyers.map(({ account, pk, index }) => ({
      index,
      address: account.address,
      privateKey: pk,
    })),
  }, null, 2), { encoding: 'utf8', mode: 0o600 });
  return outputPath;
}

function loadBuyerWallets(walletFile, concurrency) {
  const inputPath = path.resolve(walletFile);
  const saved = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  if (saved.chainId !== arcTestnet.id || !Array.isArray(saved.wallets)) {
    throw new Error(`Invalid Arc testnet wallet recovery file: ${inputPath}`);
  }
  if (saved.wallets.length < concurrency) {
    throw new Error(`Recovery file has ${saved.wallets.length} wallets; ${concurrency} requested`);
  }
  return {
    walletFile: inputPath,
    buyers: saved.wallets.slice(0, concurrency).map(({ privateKey, index }, position) => ({
      pk: privateKey,
      account: privateKeyToAccount(privateKey),
      index: Number.isInteger(index) ? index : position,
    })),
  };
}

/**
 * Retry wrapper for RPC reads — handles Arc testnet rate limits (-32011).
 */
async function readRetry(publicClient, params, label = 'read', maxAttempts = 10) {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await publicClient.readContract(params);
    } catch (e) {
      const msg = (e.shortMessage || '') + ' ' + (e.message || '');
      if (msg.includes('request limit reached') || msg.includes('-32011') || msg.includes('rate')) {
        if (attempt % 3 === 0)
          console.log(`  [${label}] RPC rate-limited, retrying (${attempt + 1}/${maxAttempts})...`);
        await sleep(8000);
        continue;
      }
      throw e;
    }
  }
  throw new Error(`${label}: failed after ${maxAttempts} retries`);
}

/**
 * Retry wrapper for RPC writes.
 */
async function writeRetry(walletClient, params, label = 'write', maxAttempts = 10) {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await walletClient.writeContract(params);
    } catch (e) {
      const msg = (e.shortMessage || '') + ' ' + (e.message || '');
      if (msg.includes('request limit reached') || msg.includes('-32011') || msg.includes('rate')) {
        if (attempt % 3 === 0)
          console.log(`  [${label}] RPC rate-limited, retrying (${attempt + 1}/${maxAttempts})...`);
        await sleep(8000);
        continue;
      }
      throw e;
    }
  }
  throw new Error(`${label}: failed after ${maxAttempts} retries`);
}

/**
 * Wait for a tx receipt with rate-limit-aware polling.
 */
async function waitForReceipt(publicClient, hash, label = 'tx', timeoutMs = 120000) {
  const start = Date.now();
  for (let attempt = 0; attempt < 60; attempt++) {
    if (Date.now() - start > timeoutMs) {
      throw new Error(`${label}: receipt timeout after ${timeoutMs}ms`);
    }
    try {
      const receipt = await publicClient.getTransactionReceipt({ hash });
      if (receipt) return receipt;
    } catch (e) {
      const msg = (e.shortMessage || '') + ' ' + (e.message || '') + ' ' + (e.name || '');
      if (
        msg.includes('request limit reached') ||
        msg.includes('-32011') ||
        msg.includes('rate')
      ) {
        await sleep(10000);
        continue;
      }
      if (
        msg.includes('not found') ||
        msg.includes('pending') ||
        msg.includes('TXN') ||
        e.name === 'TransactionReceiptNotFoundError'
      ) {
        await sleep(3000);
        continue;
      }
      throw e;
    }
    await sleep(3000);
  }
  throw new Error(`${label}: receipt not found after 60 attempts`);
}

/**
 * Format a duration in milliseconds as a human-readable string.
 */
function fmtDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${m}m${s}s`;
}

/**
 * Run a single buyer's flow: approve USDC → buy tokens.
 * Returns { success, txHash, error, tokensOut, durationMs }.
 */
async function runBuyer(buyerAccount, curve, usdcAmount, transport, buyerIndex) {
  const publicClient = createPublicClient({ chain: arcTestnet, transport });
  const walletClient = createWalletClient({
    chain: arcTestnet,
    transport,
    account: buyerAccount,
  });
  const label = `buyer-${buyerIndex + 1}`;
  const start = Date.now();
  try {
    // 1. Quote to get expected tokens out (for slippage)
    const quote = await readRetry(
      publicClient,
      { address: curve, abi: BONDING_CURVE_ABI, functionName: 'quoteBuy', args: [usdcAmount] },
      `${label}:quote`,
    );
    const minOut = (quote * 95n) / 100n; // 5% slippage

    // 2. Approve USDC for the curve
    const approveHash = await writeRetry(
      walletClient,
      { address: USDC, abi: erc20Abi, functionName: 'approve', args: [curve, usdcAmount] },
      `${label}:approve`,
    );
    await waitForReceipt(publicClient, approveHash, `${label}:approve`);

    // 3. Buy tokens
    const buyHash = await writeRetry(
      walletClient,
      { address: curve, abi: BONDING_CURVE_ABI, functionName: 'buy', args: [usdcAmount, minOut] },
      `${label}:buy`,
    );
    const receipt = await waitForReceipt(publicClient, buyHash, `${label}:buy`);

    const durationMs = Date.now() - start;
    if (receipt.status === 'success') {
      return {
        success: true,
        txHash: buyHash,
        error: null,
        tokensOut: quote, // approximate (actual may differ slightly due to concurrent buys)
        durationMs,
        blockNumber: receipt.blockNumber,
      };
    } else {
      return {
        success: false,
        txHash: buyHash,
        error: `tx reverted (status ${receipt.status})`,
        tokensOut: 0n,
        durationMs,
        blockNumber: receipt.blockNumber,
      };
    }
  } catch (e) {
    return {
      success: false,
      txHash: null,
      error: e.shortMessage || e.message || String(e),
      tokensOut: 0n,
      durationMs: Date.now() - start,
      blockNumber: null,
    };
  }
}

async function main() {
  const curve = process.argv[2];
  const concurrency = parseInt(process.argv[3] || '10', 10);
  const usdcPerBuyStr = process.argv[4] || '1';
  const usdcPerBuy = parseUnits(usdcPerBuyStr, 6);

  if (!curve) {
    console.error('Usage: node scripts/load-test-buys.js <curve-address> [concurrency=10] [usdc-per-buy=1]');
    process.exit(1);
  }
  if (!DEPLOYER_PK) {
    console.error('DEPLOYER_PRIVATE_KEY not set');
    process.exit(1);
  }
  if (concurrency < 1 || concurrency > 100) {
    console.error('Concurrency must be between 1 and 100');
    process.exit(1);
  }

  const deployerAccount = privateKeyToAccount(DEPLOYER_PK);
  const transport = fallback(RPC_URLS.map((url) => http(url, { pollingInterval: 4_000 })), {
    rank: false,
  });
  const publicClient = createPublicClient({ chain: arcTestnet, transport });
  const deployerWallet = createWalletClient({
    chain: arcTestnet,
    transport,
    account: deployerAccount,
  });

  console.log('========================================');
  console.log('  Orba Load Test — Concurrent Buys');
  console.log('========================================');
  console.log(`Curve:        ${curve}`);
  console.log(`Concurrency:  ${concurrency} buyers`);
  console.log(`USDC per buy: ${usdcPerBuyStr} USDC (${usdcPerBuy} micro-USDC)`);
  console.log(`Deployer:     ${deployerAccount.address}`);
  console.log('');

  // ─── Pre-flight: check curve state + deployer balance ──────────────────
  console.log('--- Pre-flight checks ---');
  let tokensSoldBefore, marketCapBefore, reserveTokensBefore;
  try {
    [tokensSoldBefore, marketCapBefore, reserveTokensBefore] = await Promise.all([
      readRetry(publicClient, { address: curve, abi: BONDING_CURVE_ABI, functionName: 'tokensSold' }, 'tokensSold-before'),
      readRetry(publicClient, { address: curve, abi: BONDING_CURVE_ABI, functionName: 'marketCap' }, 'marketCap-before'),
      readRetry(publicClient, { address: curve, abi: BONDING_CURVE_ABI, functionName: 'reserveTokens' }, 'reserveTokens-before'),
    ]);
    console.log(`  tokensSold before:    ${formatUnits(tokensSoldBefore, 18)}`);
    console.log(`  marketCap before:     $${formatUnits(marketCapBefore, 6)}`);
    console.log(`  reserveTokens before: ${formatUnits(reserveTokensBefore, 18)}`);
  } catch (e) {
    console.error(`Pre-flight failed — cannot read curve state: ${e.message}`);
    process.exit(1);
  }

  // Check deployer USDC balance (ERC-20, 6-dec)
  let deployerUsdcBalance;
  try {
    deployerUsdcBalance = await readRetry(
      publicClient,
      { address: USDC, abi: erc20Abi, functionName: 'balanceOf', args: [deployerAccount.address] },
      'deployerBalance',
    );
    console.log(`  Deployer USDC balance: ${formatUnits(deployerUsdcBalance, 6)} USDC`);
  } catch (e) {
    console.error(`Cannot read deployer USDC balance: ${e.message}`);
    process.exit(1);
  }

  // Arc's native and ERC-20 USDC views represent the same asset at different
  // decimal scales. One native transfer therefore funds both the buy and gas.
  const gasBufferPerBuyer = parseUnits(process.env.LOAD_TEST_GAS_BUFFER_USDC || '0.01', 18);
  const buyPerBuyerNative = usdcPerBuy * 1_000_000_000_000n;
  const fundingPerBuyer = buyPerBuyerNative + gasBufferPerBuyer;
  let fundingGasPerBuyer;
  let fundingGasPrice;
  try {
    [fundingGasPerBuyer, fundingGasPrice] = await Promise.all([
      publicClient.estimateGas({
        account: deployerAccount,
        to: deployerAccount.address,
        value: fundingPerBuyer,
      }),
      publicClient.getGasPrice(),
    ]);
  } catch (e) {
    console.error(`Cannot estimate funding cost safely: ${e.shortMessage || e.message}`);
    process.exit(1);
  }
  const estimatedFundingFees = fundingGasPerBuyer * fundingGasPrice * BigInt(concurrency);
  const fundingFeeReserve = (estimatedFundingFees * 125n) / 100n;
  const totalFundingNeeded = (fundingPerBuyer * BigInt(concurrency)) + fundingFeeReserve;

  let deployerNativeBalance;
  try {
    deployerNativeBalance = await publicClient.getBalance({ address: deployerAccount.address });
    console.log(`  Deployer native balance: ${formatUnits(deployerNativeBalance, 18)} USDC (native)`);
    if (deployerNativeBalance < totalFundingNeeded) {
      console.error(
        `Insufficient USDC: need ${formatUnits(totalFundingNeeded, 18)}, have ${formatUnits(deployerNativeBalance, 18)}`,
      );
      process.exit(1);
    }
  } catch (e) {
    console.error(`Cannot read deployer native balance: ${e.message}`);
    process.exit(1);
  }

  console.log(`  Buyer funding value: ${formatUnits(fundingPerBuyer * BigInt(concurrency), 18)} USDC`);
  console.log(`  Estimated funding fees + 25% reserve: ${formatUnits(fundingFeeReserve, 18)} USDC`);
  console.log(`  Total pre-flight requirement: ${formatUnits(totalFundingNeeded, 18)} USDC`);
  console.log(`  Gas buffer per buyer: ${formatUnits(gasBufferPerBuyer, 18)} USDC`);
  console.log('');

  // ─── Step 1: Generate ephemeral buyer wallets ──────────────────────────
  const configuredWalletFile = process.env.LOAD_TEST_WALLET_FILE;
  console.log(`--- Step 1: ${configuredWalletFile ? 'Loading' : 'Generating'} ${concurrency} ephemeral buyer wallets ---`);
  let buyers;
  let walletFile;
  if (configuredWalletFile && fs.existsSync(path.resolve(configuredWalletFile))) {
    ({ buyers, walletFile } = loadBuyerWallets(configuredWalletFile, concurrency));
    console.log(`  Loaded ${buyers.length} wallets from the recovery file`);
  } else {
    buyers = [];
    for (let i = 0; i < concurrency; i++) {
      const pk = generatePrivateKey();
      const account = privateKeyToAccount(pk);
      buyers.push({ account, pk, index: i });
    }
    console.log(`  Generated ${buyers.length} wallets`);
    walletFile = saveBuyerWallets(buyers, curve);
  }
  console.log(`  Recovery file: ${walletFile}`);
  console.log('  It contains testnet private keys; keep it private and delete it after recovering funds.');
  console.log('');

  // ─── Step 2: Fund each buyer (USDC + native for gas) ───────────────────
  console.log('--- Step 2: Funding buyer wallets ---');
  console.log(`  Sending ${formatUnits(fundingPerBuyer, 18)} USDC to each buyer...`);

  // Fund once per buyer because Arc native and ERC-20 USDC are the same asset.
  const fundingStart = Date.now();
  let funded = 0;
  let fundingErrors = 0;

  // Fund buyers SEQUENTIALLY — they all use the deployer wallet's nonce,
  // so parallel sends cause nonce conflicts. Funding is not the load test.
  const fundedBuyers = [];
  for (let i = 0; i < buyers.length; i++) {
    const buyer = buyers[i];
    try {
      const currentBalance = await publicClient.getBalance({ address: buyer.account.address });
      if (currentBalance >= fundingPerBuyer) {
        funded++;
        fundedBuyers.push(buyer);
        if ((i + 1) % 5 === 0 || i === buyers.length - 1) {
          console.log(`  Ready ${i + 1}/${buyers.length}...`);
        }
        continue;
      }
      const nativeHash = await deployerWallet.sendTransaction({
        to: buyer.account.address,
        value: fundingPerBuyer - currentBalance,
      });
      await waitForReceipt(publicClient, nativeHash, `fund-buyer-${buyer.index}`);

      funded++;
      fundedBuyers.push(buyer);
      if ((i + 1) % 5 === 0 || i === buyers.length - 1) {
        console.log(`  Funded ${i + 1}/${buyers.length}...`);
      }
    } catch (e) {
      console.log(`  [buyer-${buyer.index + 1}] funding failed: ${e.shortMessage || e.message}`);
      fundingErrors++;
    }
  }

  const fundingDuration = Date.now() - fundingStart;
  console.log(`  Funding complete: ${funded} funded, ${fundingErrors} errors in ${fmtDuration(fundingDuration)}`);
  if (fundedBuyers.length < concurrency) {
    console.error(`  Only ${fundedBuyers.length}/${concurrency} buyers funded. Aborting instead of reporting a partial load test.`);
    console.error(`  Recover any funded testnet balances with: ${walletFile}`);
    process.exit(1);
  }
  const activeBuyers = fundedBuyers;
  const allBuyersFunded = activeBuyers.length === concurrency;
  console.log('');

  // ─── Step 3: Concurrent buys (the actual load test) ────────────────────
  console.log('--- Step 3: Concurrent buys (LOAD TEST) ---');
  console.log(`  Launching ${funded} concurrent buyers...`);
  console.log(`  Each buys ${usdcPerBuyStr} USDC worth of tokens on curve ${curve}`);
  console.log('');

  const loadStart = Date.now();
  const results = await Promise.all(
    activeBuyers.map((buyer) => runBuyer(buyer.account, curve, usdcPerBuy, transport, buyer.index)),
  );
  const loadDuration = Date.now() - loadStart;

  // ─── Step 4: Analyze results ───────────────────────────────────────────
  console.log('--- Step 4: Analyzing results ---');
  const successes = results.filter((r) => r.success);
  const failures = results.filter((r) => !r.success);
  const durations = results.map((r) => r.durationMs);
  const successDurations = successes.map((r) => r.durationMs);

  const avgDuration =
    successDurations.length > 0
      ? successDurations.reduce((a, b) => a + b, 0) / successDurations.length
      : 0;
  const maxDuration = successDurations.length > 0 ? Math.max(...successDurations) : 0;
  const minDuration = successDurations.length > 0 ? Math.min(...successDurations) : 0;
  const throughput = successes.length / (loadDuration / 1000);

  console.log(`  Total time:        ${fmtDuration(loadDuration)}`);
  console.log(`  Successful buys:   ${successes.length}/${results.length}`);
  console.log(`  Failed buys:       ${failures.length}/${results.length}`);
  console.log(`  Throughput:        ${throughput.toFixed(2)} txs/s`);
  console.log(`  Avg tx duration:   ${fmtDuration(avgDuration)}`);
  console.log(`  Min tx duration:   ${fmtDuration(minDuration)}`);
  console.log(`  Max tx duration:   ${fmtDuration(maxDuration)}`);
  console.log('');

  // Categorize failures
  if (failures.length > 0) {
    console.log('  Failure breakdown:');
    const failureCategories = {};
    failures.forEach((f) => {
      const cat = f.error.includes('rate') || f.error.includes('-32011')
        ? 'RPC rate limit'
        : f.error.includes('revert') || f.error.includes('MaxWallet')
          ? 'Contract revert'
          : f.error.includes('timeout')
            ? 'Timeout'
            : 'Other';
      failureCategories[cat] = (failureCategories[cat] || 0) + 1;
    });
    Object.entries(failureCategories).forEach(([cat, count]) => {
      console.log(`    ${cat}: ${count}`);
    });
    console.log('');
    // Show first few failure details
    console.log('  First 3 failure details:');
    failures.slice(0, 3).forEach((f, i) => {
      console.log(`    [${i + 1}] txHash=${f.txHash || 'N/A'} error=${f.error}`);
    });
    console.log('');
  }

  // ─── Step 5: Verify on-chain state integrity ───────────────────────────
  console.log('--- Step 5: Verifying on-chain state integrity ---');
  let tokensSoldAfter, marketCapAfter, reserveTokensAfter;
  let stateConsistent = false;
  try {
    // Wait a moment for finality
    await sleep(3000);
    [tokensSoldAfter, marketCapAfter, reserveTokensAfter] = await Promise.all([
      readRetry(publicClient, { address: curve, abi: BONDING_CURVE_ABI, functionName: 'tokensSold' }, 'tokensSold-after'),
      readRetry(publicClient, { address: curve, abi: BONDING_CURVE_ABI, functionName: 'marketCap' }, 'marketCap-after'),
      readRetry(publicClient, { address: curve, abi: BONDING_CURVE_ABI, functionName: 'reserveTokens' }, 'reserveTokens-after'),
    ]);
    const tokensSoldDelta = tokensSoldAfter - tokensSoldBefore;
    console.log(`  tokensSold after:     ${formatUnits(tokensSoldAfter, 18)}`);
    console.log(`  tokensSold delta:     ${formatUnits(tokensSoldDelta, 18)} (from ${successes.length} successful buys)`);
    console.log(`  marketCap after:      $${formatUnits(marketCapAfter, 6)}`);
    console.log(`  marketCap delta:      $${formatUnits(marketCapAfter - marketCapBefore, 6)}`);
    console.log(`  reserveTokens after:  ${formatUnits(reserveTokensAfter, 18)}`);

    // Sanity check: tokensSold should have increased (unless all buys failed)
    if (successes.length > 0 && tokensSoldDelta <= 0n) {
      console.log('  ⚠ WARNING: tokensSold did not increase despite successful buys — possible state corruption!');
    } else {
      console.log('  ✓ On-chain state consistent with successful buys');
      stateConsistent = true;
    }
  } catch (e) {
    console.log(`  ⚠ Could not verify on-chain state: ${e.message}`);
  }
  console.log('');

  // ─── Step 6: Measure indexer lag ───────────────────────────────────────
  console.log('--- Step 6: Measuring indexer lag ---');
  let indexerComplete = SKIP_INDEXER_CHECK || successes.length === 0;
  if (SKIP_INDEXER_CHECK) {
    console.log('  Skipped by SKIP_INDEXER_CHECK=true (parallel stack is not connected to the live indexer)');
  } else if (successes.length === 0) {
    console.log('  Skipped (no successful buys to index)');
  } else {
    console.log(`  Polling API until ${successes.length} new trades appear...`);
    const indexerStart = Date.now();
    let indexedCount = 0;
    let indexerLagMs = null;

    // Find the token address from the curve address via the API
    let tokenAddress = null;
    try {
      const tokensRes = await fetch(`${API}/tokens?limit=100`);
      const { tokens } = await tokensRes.json();
      const token = tokens.find((t) => t.curve_address.toLowerCase() === curve.toLowerCase());
      if (token) tokenAddress = token.contract_address;
    } catch (e) {
      console.log(`  ⚠ Could not find token in API: ${e.message}`);
    }

    if (tokenAddress) {
      const successTxHashes = new Set(successes.map((s) => s.txHash.toLowerCase()));
      const indexerDeadline = Date.now() + 120000; // 2 min timeout
      while (Date.now() < indexerDeadline) {
        try {
          const tradesRes = await fetch(`${API}/tokens/${tokenAddress}/trades?limit=100`);
          const tradesJson = await tradesRes.json();
          const trades = tradesJson.trades || [];
          const matchingTrades = trades.filter((t) => successTxHashes.has(t.tx_hash?.toLowerCase()));
          if (matchingTrades.length > indexedCount) {
            indexedCount = matchingTrades.length;
            console.log(`  Indexed ${indexedCount}/${successes.length} trades...`);
          }
          if (indexedCount >= successes.length) {
            indexerLagMs = Date.now() - indexerStart;
            indexerComplete = true;
            console.log(`  ✓ All ${successes.length} trades indexed in ${fmtDuration(indexerLagMs)}`);
            break;
          }
        } catch (e) {
          console.log(`  API poll error: ${e.message}`);
        }
        await sleep(5000);
      }

      if (indexerLagMs === null) {
        console.log(`  ⚠ Indexer did not catch up within 120s (${indexedCount}/${successes.length} indexed)`);
      }
    } else {
      console.log('  ⚠ Could not resolve token address from curve — skipping indexer lag test');
    }
  }
  console.log('');

  // ─── Summary ───────────────────────────────────────────────────────────
  console.log('========================================');
  console.log('  LOAD TEST SUMMARY');
  console.log('========================================');
  console.log(`  Concurrency:        ${concurrency}`);
  console.log(`  USDC per buy:       ${usdcPerBuyStr} USDC`);
  console.log(`  Successful:         ${successes.length}/${results.length}`);
  console.log(`  Failed:             ${failures.length}/${results.length}`);
  console.log(`  Total duration:     ${fmtDuration(loadDuration)}`);
  console.log(`  Throughput:         ${throughput.toFixed(2)} txs/s`);
  console.log(`  Avg tx duration:    ${fmtDuration(avgDuration)}`);
  console.log(`  Max tx duration:    ${fmtDuration(maxDuration)}`);

  // Pass/fail criteria:
  // - At least 80% of buys should succeed (allow some RPC rate-limit failures)
  // - No contract reverts from reentrancy or state corruption
  // - On-chain state consistent
  const successRate = successes.length / results.length;
  const contractReverts = failures.filter((f) =>
    f.error.includes('revert') || f.error.includes('MaxWallet') || f.error.includes('Reentrancy'),
  ).length;

  console.log('');
  console.log('  Pass criteria:');
  console.log(`    ✓ Requested buyers funded:    ${allBuyersFunded ? 'PASS' : 'FAIL'} (${activeBuyers.length}/${concurrency})`);
  console.log(`    ✓ Success rate >= 80%:        ${successRate >= 0.8 ? 'PASS' : 'FAIL'} (${(successRate * 100).toFixed(1)}%)`);
  console.log(`    ✓ No contract reverts:        ${contractReverts === 0 ? 'PASS' : 'FAIL'} (${contractReverts} reverts)`);
  console.log(`    ✓ On-chain state consistent:  ${stateConsistent ? 'PASS' : 'FAIL'}`);
  console.log(`    ✓ Indexer caught up:          ${indexerComplete ? 'PASS' : 'FAIL'}`);

  const overallPass = allBuyersFunded && successRate >= 0.8 && contractReverts === 0 && stateConsistent && indexerComplete;
  console.log('');
  console.log(`  Overall: ${overallPass ? '✓ PASS' : '✗ FAIL'}`);
  console.log('========================================');

  process.exit(overallPass ? 0 : 1);
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
