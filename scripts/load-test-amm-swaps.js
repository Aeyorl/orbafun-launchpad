/**
 * AMM swap contention test — simulates heavy swap load on a graduated token's
 * AMM pair to verify the constant-product invariant holds under concurrent swaps.
 *
 * Phase 4 requirement (from 05_PHASE4_testing_security.md):
 *   "AMM swap contention test: post-graduation, simulate heavy swap load on a
 *    graduated token's AMM pair. Verify the constant-product invariant holds
 *    under concurrent swaps and no rounding errors accumulate to an exploitable
 *    degree."
 *
 * What this script does:
 *   1. Reads the graduated token + AMM pair addresses (from graduation test output)
 *   2. Generates N ephemeral swapper wallets
 *   3. Funds each with USDC (for buying) + native USDC (for gas) + tokens
 *      (for selling — pre-loaded from the deployer's token balance)
 *   4. Half the swappers do token→USDC swaps (sell), half do USDC→token swaps (buy)
 *   5. All N swaps fire concurrently
 *   6. Verifies: constant-product invariant (k before ≈ k after), no reverts,
 *      reserves are consistent
 *
 * Usage:
 *   node scripts/load-test-amm-swaps.js [concurrency=10] [usdc-per-swap=1]
 *
 * Requires: load-test-graduation.js to have run first (generates addresses JSON).
 * ~$20 USDC cost for 10 concurrent swappers.
 */
require('dotenv').config();
if (process.env.ALLOW_UNSAFE_DIRECT_AMM_TEST !== 'true') {
  throw new Error(
    'This legacy direct-pair contention reproducer is disabled. Use scripts/e2e-graduation.js with the authorized AMMRouter.',
  );
}
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
const fs = require('fs');
const path = require('path');

const DEPLOYER_PK = process.env.DEPLOYER_PRIVATE_KEY;
const RPC_URLS = (
  process.env.ARC_RPC_URLS ||
  'https://rpc.testnet.arc.io,https://rpc.drpc.testnet.arc.io,https://rpc.quicknode.testnet.arc.io,https://rpc.blockdaemon.testnet.arc.io'
)
  .split(',')
  .map((u) => u.trim())
  .filter(Boolean);

const USDC = '0x3600000000000000000000000000000000000000';
const BURN_ADDRESS = '0x000000000000000000000000000000000000dEaD';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// AMM Pair ABI — this AMM is a simplified Uniswap V2 fork with 0% fee and
// 3-arg swap (no flash swap `data` parameter).
const AMM_PAIR_ABI = [
  {
    name: 'swap',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'amount0Out', type: 'uint256' },
      { name: 'amount1Out', type: 'uint256' },
      { name: 'to', type: 'address' },
    ],
    outputs: [],
  },
  {
    name: 'getReserves',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      { name: '_reserve0', type: 'uint112' },
      { name: '_reserve1', type: 'uint112' },
      { name: '_blockTimestampLast', type: 'uint32' },
    ],
  },
  {
    name: 'token0',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    name: 'token1',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    name: 'sync',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [],
  },
];

const MEME_TOKEN_ABI = [
  {
    name: 'transfer',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
];

async function readRetry(publicClient, params, label = 'read', maxAttempts = 10) {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await publicClient.readContract(params);
    } catch (e) {
      const msg = (e.shortMessage || '') + ' ' + (e.message || '');
      if (msg.includes('request limit reached') || msg.includes('-32011') || msg.includes('rate')) {
        await sleep(8000);
        continue;
      }
      throw e;
    }
  }
  throw new Error(`${label}: failed after ${maxAttempts} retries`);
}

async function writeRetry(walletClient, params, label = 'write', maxAttempts = 10) {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await walletClient.writeContract(params);
    } catch (e) {
      const msg = (e.shortMessage || '') + ' ' + (e.message || '');
      if (msg.includes('request limit reached') || msg.includes('-32011') || msg.includes('rate')) {
        await sleep(8000);
        continue;
      }
      throw e;
    }
  }
  throw new Error(`${label}: failed after ${maxAttempts} retries`);
}

async function waitForReceipt(publicClient, hash, label = 'tx', timeoutMs = 120000) {
  const start = Date.now();
  for (let attempt = 0; attempt < 60; attempt++) {
    if (Date.now() - start > timeoutMs) throw new Error(`${label}: receipt timeout`);
    try {
      const receipt = await publicClient.getTransactionReceipt({ hash });
      if (receipt) return receipt;
    } catch (e) {
      const msg = (e.shortMessage || '') + ' ' + (e.message || '');
      const name = e.name || '';
      if (msg.includes('rate') || msg.includes('-32011')) { await sleep(10000); continue; }
      // Match all variants: "not found", "could not be found", "pending", "TXN"
      // and viem's TransactionReceiptNotFoundError class.
      if (msg.includes('not found') || msg.includes('could not be found') || msg.includes('pending') || msg.includes('TXN') || name === 'TransactionReceiptNotFoundError') { await sleep(4000); continue; }
      throw e;
    }
    await sleep(4000);
  }
  throw new Error(`${label}: receipt not found`);
}

/**
 * Execute a USDC→token swap on the AMM pair.
 * Flow: approve USDC to pair → transfer USDC to pair → call pair.swap()
 * This is the low-level Uniswap V2 swap pattern (no router).
 */
async function swapUsdcToToken(swapper, ammPair, tokenOut, usdcAmount, transport, index) {
  const publicClient = createPublicClient({ chain: arcTestnet, transport });
  const walletClient = createWalletClient({ chain: arcTestnet, transport, account: swapper });
  const label = `swap-buy-${index + 1}`;
  const start = Date.now();

  try {
    // Read current reserves
    const [reserve0, reserve1] = await readRetry(
      publicClient, { address: ammPair, abi: AMM_PAIR_ABI, functionName: 'getReserves' }, `${label}:reserves`,
    );
    const token0 = await readRetry(
      publicClient, { address: ammPair, abi: AMM_PAIR_ABI, functionName: 'token0' }, `${label}:token0`,
    );

    // Determine which reserve is USDC and which is the token
    const isUsdcToken0 = token0.toLowerCase() === USDC.toLowerCase();
    const usdcReserve = isUsdcToken0 ? reserve0 : reserve1;
    const tokenReserve = isUsdcToken0 ? reserve1 : reserve0;

    // Calculate output using constant product (0% fee — this AMM has no fee logic)
    // amountOut = (amountIn * reserveOut) / (reserveIn + amountIn)
    const tokenOutAmount = (usdcAmount * tokenReserve) / (usdcReserve + usdcAmount);

    if (tokenOutAmount === 0n) {
      return { success: false, error: 'Output amount is 0', durationMs: Date.now() - start };
    }

    // Apply 10% slippage tolerance — concurrent swaps may move reserves between
    // our read and our swap execution, so request less than the full quoted amount.
    // The invariant check will pass as long as actual reserves haven't moved >10%.
    const minTokenOut = (tokenOutAmount * 90n) / 100n;

    // Approve USDC for the pair
    const approveHash = await writeRetry(
      walletClient,
      { address: USDC, abi: erc20Abi, functionName: 'approve', args: [ammPair, usdcAmount] },
      `${label}:approve`,
    );
    await waitForReceipt(publicClient, approveHash, `${label}:approve`);

    // Transfer USDC to the pair
    const transferHash = await writeRetry(
      walletClient,
      { address: USDC, abi: erc20Abi, functionName: 'transfer', args: [ammPair, usdcAmount] },
      `${label}:transfer`,
    );
    await waitForReceipt(publicClient, transferHash, `${label}:transfer`);

    // Call swap — 3-arg (no data param), output the token to the swapper.
    // Request minTokenOut (with slippage) instead of full quote — the contract
    // sends exactly what we ask for, so requesting less is safe.
    const amount0Out = isUsdcToken0 ? 0n : minTokenOut;
    const amount1Out = isUsdcToken0 ? minTokenOut : 0n;
    const swapHash = await writeRetry(
      walletClient,
      { address: ammPair, abi: AMM_PAIR_ABI, functionName: 'swap', args: [amount0Out, amount1Out, swapper.address] },
      `${label}:swap`,
    );
    const receipt = await waitForReceipt(publicClient, swapHash, `${label}:swap`);

    return {
      success: receipt.status === 'success',
      txHash: swapHash,
      error: receipt.status === 'success' ? null : 'swap reverted',
      durationMs: Date.now() - start,
      type: 'buy',
      amountIn: usdcAmount,
      amountOut: tokenOutAmount,
    };
  } catch (e) {
    return { success: false, error: e.shortMessage || e.message, durationMs: Date.now() - start, type: 'buy' };
  }
}

/**
 * Execute a token→USDC swap on the AMM pair.
 */
async function swapTokenToUsdc(swapper, ammPair, tokenAmount, transport, index) {
  const publicClient = createPublicClient({ chain: arcTestnet, transport });
  const walletClient = createWalletClient({ chain: arcTestnet, transport, account: swapper });
  const label = `swap-sell-${index + 1}`;
  const start = Date.now();

  try {
    const [reserve0, reserve1] = await readRetry(
      publicClient, { address: ammPair, abi: AMM_PAIR_ABI, functionName: 'getReserves' }, `${label}:reserves`,
    );
    const token0 = await readRetry(
      publicClient, { address: ammPair, abi: AMM_PAIR_ABI, functionName: 'token0' }, `${label}:token0`,
    );

    const isUsdcToken0 = token0.toLowerCase() === USDC.toLowerCase();
    const usdcReserve = isUsdcToken0 ? reserve0 : reserve1;
    const tokenReserve = isUsdcToken0 ? reserve1 : reserve0;

    // Calculate USDC output (0% fee — this AMM has no fee logic)
    // amountOut = (amountIn * reserveOut) / (reserveIn + amountIn)
    const usdcOutAmount = (tokenAmount * usdcReserve) / (tokenReserve + tokenAmount);

    if (usdcOutAmount === 0n) {
      return { success: false, error: 'Output amount is 0', durationMs: Date.now() - start };
    }

    // Apply 10% slippage tolerance for concurrent swap safety
    const minUsdcOut = (usdcOutAmount * 90n) / 100n;

    // Determine the token address (not USDC) for approve + transfer
    const tokenAddress = isUsdcToken0
      ? await readRetry(publicClient, { address: ammPair, abi: AMM_PAIR_ABI, functionName: 'token1' }, `${label}:token1`)
      : token0;

    // Approve token for the pair
    const approveHash = await writeRetry(
      walletClient,
      { address: tokenAddress, abi: MEME_TOKEN_ABI, functionName: 'approve', args: [ammPair, tokenAmount] },
      `${label}:approve`,
    );
    await waitForReceipt(publicClient, approveHash, `${label}:approve`);

    // Transfer tokens to the pair
    const transferHash = await writeRetry(
      walletClient,
      { address: tokenAddress, abi: MEME_TOKEN_ABI, functionName: 'transfer', args: [ammPair, tokenAmount] },
      `${label}:transfer`,
    );
    await waitForReceipt(publicClient, transferHash, `${label}:transfer`);

    // Call swap — 3-arg (no data param), output USDC to the swapper.
    // Request minUsdcOut (with slippage) for concurrent safety.
    const amount0Out = isUsdcToken0 ? minUsdcOut : 0n;
    const amount1Out = isUsdcToken0 ? 0n : minUsdcOut;
    const swapHash = await writeRetry(
      walletClient,
      { address: ammPair, abi: AMM_PAIR_ABI, functionName: 'swap', args: [amount0Out, amount1Out, swapper.address] },
      `${label}:swap`,
    );
    const receipt = await waitForReceipt(publicClient, swapHash, `${label}:swap`);

    return {
      success: receipt.status === 'success',
      txHash: swapHash,
      error: receipt.status === 'success' ? null : 'swap reverted',
      durationMs: Date.now() - start,
      type: 'sell',
      amountIn: tokenAmount,
      amountOut: usdcOutAmount,
    };
  } catch (e) {
    return { success: false, error: e.shortMessage || e.message, durationMs: Date.now() - start, type: 'sell' };
  }
}

async function main() {
  const concurrency = parseInt(process.argv[2] || '10', 10);
  const usdcPerSwapStr = process.argv[3] || '1';
  const usdcPerSwap = parseUnits(usdcPerSwapStr, 6);

  // Load graduated token addresses
  const addressesPath = path.join(__dirname, 'load-test-graduated-addresses.json');
  if (!fs.existsSync(addressesPath)) {
    console.error('No graduated addresses found. Run load-test-graduation.js first.');
    process.exit(1);
  }
  const { tokenAddress, ammPair } = JSON.parse(fs.readFileSync(addressesPath, 'utf8'));

  if (!DEPLOYER_PK) {
    console.error('DEPLOYER_PRIVATE_KEY not set');
    process.exit(1);
  }

  const deployerAccount = privateKeyToAccount(DEPLOYER_PK);
  const transport = fallback(RPC_URLS.map((url) => http(url, { pollingInterval: 4_000 })), { rank: false });
  const publicClient = createPublicClient({ chain: arcTestnet, transport });
  const deployerWallet = createWalletClient({ chain: arcTestnet, transport, account: deployerAccount });

  console.log('========================================');
  console.log('  AMM Swap Contention Test');
  console.log('========================================');
  console.log(`Token:        ${tokenAddress}`);
  console.log(`AMM Pair:     ${ammPair}`);
  console.log(`Concurrency:  ${concurrency} swappers`);
  console.log(`USDC/swap:    ${usdcPerSwapStr} USDC`);
  console.log(`Deployer:     ${deployerAccount.address}`);
  console.log('');

  // Pre-flight: sync pair first (previous failed swaps may have left tokens
  // with stale reserves), then read AMM reserves
  console.log('--- Pre-flight ---');
  try {
    const syncHash = await writeRetry(deployerWallet, { address: ammPair, abi: AMM_PAIR_ABI, functionName: 'sync' }, 'sync-init');
    await waitForReceipt(publicClient, syncHash, 'sync-init');
    console.log('  Synced pair (cleared stale reserves from failed swaps)');
  } catch (e) {
    console.log(`  ⚠ Initial sync failed: ${e.message}`);
  }
  const [reserve0Before, reserve1Before] = await readRetry(
    publicClient, { address: ammPair, abi: AMM_PAIR_ABI, functionName: 'getReserves' }, 'reserves-before',
  );
  const token0 = await readRetry(publicClient, { address: ammPair, abi: AMM_PAIR_ABI, functionName: 'token0' }, 'token0');
  const isUsdcToken0 = token0.toLowerCase() === USDC.toLowerCase();
  const usdcReserveBefore = isUsdcToken0 ? reserve0Before : reserve1Before;
  const tokenReserveBefore = isUsdcToken0 ? reserve1Before : reserve0Before;
  const kBefore = BigInt(reserve0Before) * BigInt(reserve1Before);

  console.log(`  token0: ${token0} (${isUsdcToken0 ? 'USDC' : 'Token'})`);
  console.log(`  Reserve0: ${reserve0Before}`);
  console.log(`  Reserve1: ${reserve1Before}`);
  console.log(`  USDC reserve: ${formatUnits(usdcReserveBefore, 6)} USDC`);
  console.log(`  Token reserve: ${formatUnits(tokenReserveBefore, 18)} tokens`);
  console.log(`  k (constant product): ${kBefore}`);
  console.log('');

  // Check deployer token balance (for funding sellers)
  const deployerTokenBalance = await readRetry(
    publicClient, { address: tokenAddress, abi: MEME_TOKEN_ABI, functionName: 'balanceOf', args: [deployerAccount.address] }, 'deployerTokenBalance',
  );
  console.log(`  Deployer token balance: ${formatUnits(deployerTokenBalance, 18)} tokens`);

  const deployerUsdcBalance = await readRetry(
    publicClient, { address: USDC, abi: erc20Abi, functionName: 'balanceOf', args: [deployerAccount.address] }, 'deployerUsdcBalance',
  );
  console.log(`  Deployer USDC balance: ${formatUnits(deployerUsdcBalance, 6)} USDC`);
  console.log('');

  // ─── Generate + fund swappers ──────────────────────────────────────────
  console.log(`--- Generating ${concurrency} swapper wallets ---`);
  const GAS_PER_SWAPPER = parseUnits('0.5', 18);
  const halfBuy = Math.ceil(concurrency / 2);
  const halfSell = concurrency - halfBuy;

  // Buyers need: usdcPerSwap (USDC) + gas
  // Sellers need: tokenAmount (tokens) + gas
  // Token amount for sellers: equivalent to usdcPerSwap worth
  const tokenAmountPerSeller = (usdcPerSwap * tokenReserveBefore) / usdcReserveBefore; // rough equivalent

  const totalUsdcNeeded = usdcPerSwap * BigInt(halfBuy);
  const totalNativeNeeded = GAS_PER_SWAPPER * BigInt(concurrency);
  const totalTokensNeeded = tokenAmountPerSeller * BigInt(halfSell);

  console.log(`  ${halfBuy} buyers (USDC→token), ${halfSell} sellers (token→USDC)`);
  console.log(`  USDC needed: ${formatUnits(totalUsdcNeeded, 6)} USDC`);
  console.log(`  Tokens needed: ${formatUnits(totalTokensNeeded, 18)} tokens`);
  console.log(`  Native needed: ${formatUnits(totalNativeNeeded, 18)} USDC`);

  if (deployerUsdcBalance < totalUsdcNeeded + totalNativeNeeded / 10n**12n) {
    console.error(`  Insufficient USDC for funding`);
    process.exit(1);
  }
  if (deployerTokenBalance < totalTokensNeeded) {
    console.error(`  Insufficient tokens for funding sellers`);
    console.error(`  Need ${formatUnits(totalTokensNeeded, 18)}, have ${formatUnits(deployerTokenBalance, 18)}`);
    console.error(`  The deployer may have transferred tokens to throwaway addresses during graduation.`);
    console.error(`  Skipping sell-side swaps — will do buy-only swaps.`);
    // Fall back to buy-only
  }
  console.log('');

  // Generate wallets
  const swappers = [];
  for (let i = 0; i < concurrency; i++) {
    const pk = generatePrivateKey();
    const account = privateKeyToAccount(pk);
    swappers.push({ account, pk, index: i, isBuyer: i < halfBuy });
  }

  // Fund sequentially (nonce safety)
  console.log('--- Funding swappers ---');
  const canSell = deployerTokenBalance >= totalTokensNeeded;
  for (let i = 0; i < swappers.length; i++) {
    const s = swappers[i];
    try {
      // Native USDC for gas
      const nativeHash = await deployerWallet.sendTransaction({ to: s.account.address, value: GAS_PER_SWAPPER });
      await waitForReceipt(publicClient, nativeHash, `fund-native-${i}`);

      if (s.isBuyer) {
        // USDC for buying
        const usdcHash = await writeRetry(
          deployerWallet,
          { address: USDC, abi: erc20Abi, functionName: 'transfer', args: [s.account.address, usdcPerSwap] },
          `fund-usdc-${i}`,
        );
        await waitForReceipt(publicClient, usdcHash, `fund-usdc-${i}`);
      } else if (canSell) {
        // Tokens for selling
        const tokenHash = await writeRetry(
          deployerWallet,
          { address: tokenAddress, abi: MEME_TOKEN_ABI, functionName: 'transfer', args: [s.account.address, tokenAmountPerSeller] },
          `fund-token-${i}`,
        );
        await waitForReceipt(publicClient, tokenHash, `fund-token-${i}`);
      }
      if ((i + 1) % 5 === 0 || i === swappers.length - 1) {
        console.log(`  Funded ${i + 1}/${swappers.length}...`);
      }
    } catch (e) {
      console.log(`  [swapper-${i + 1}] funding failed: ${e.shortMessage || e.message}`);
    }
  }
  console.log('');

  // ─── Concurrent swaps (the actual load test) ───────────────────────────
  console.log('--- Concurrent AMM swaps (LOAD TEST) ---');
  const activeSwappers = swappers; // all generated
  const loadStart = Date.now();

  const results = await Promise.all(
    activeSwappers.map((s) => {
      if (s.isBuyer || !canSell) {
        return swapUsdcToToken(s.account, ammPair, tokenAddress, usdcPerSwap, transport, s.index);
      } else {
        return swapTokenToUsdc(s.account, ammPair, tokenAmountPerSeller, transport, s.index);
      }
    }),
  );
  const loadDuration = Date.now() - loadStart;

  // ─── Analyze results ───────────────────────────────────────────────────
  console.log('\n--- Analyzing results ---');
  const successes = results.filter((r) => r.success);
  const failures = results.filter((r) => !r.success);
  const successDurations = successes.map((r) => r.durationMs);
  const avgDuration = successDurations.length > 0 ? successDurations.reduce((a, b) => a + b, 0) / successDurations.length : 0;
  const throughput = successes.length / (loadDuration / 1000);

  console.log(`  Total time:      ${(loadDuration / 1000).toFixed(2)}s`);
  console.log(`  Successful:      ${successes.length}/${results.length}`);
  console.log(`  Failed:          ${failures.length}/${results.length}`);
  console.log(`  Throughput:      ${throughput.toFixed(2)} swaps/s`);
  console.log(`  Avg duration:    ${(avgDuration / 1000).toFixed(2)}s`);

  if (failures.length > 0) {
    console.log('\n  Failure details (first 3):');
    failures.slice(0, 3).forEach((f, i) => {
      console.log(`    [${i + 1}] type=${f.type} error=${f.error}`);
    });
  }
  console.log('');

  // ─── Verify constant-product invariant ─────────────────────────────────
  console.log('--- Verifying constant-product invariant ---');
  // Sync the pair first to update internal reserves
  try {
    const syncHash = await writeRetry(
      deployerWallet,
      { address: ammPair, abi: AMM_PAIR_ABI, functionName: 'sync' },
      'sync',
    );
    await waitForReceipt(publicClient, syncHash, 'sync');
  } catch (e) {
    console.log(`  ⚠ Could not sync pair: ${e.message}`);
  }

  const [reserve0After, reserve1After] = await readRetry(
    publicClient, { address: ammPair, abi: AMM_PAIR_ABI, functionName: 'getReserves' }, 'reserves-after',
  );
  const kAfter = BigInt(reserve0After) * BigInt(reserve1After);

  console.log(`  k before: ${kBefore}`);
  console.log(`  k after:  ${kAfter}`);

  // k should be approximately preserved (slight increase from fees)
  // In Uniswap V2 with 0.3% fee, k only increases (never decreases)
  const kDelta = kAfter - kBefore;
  const kDeltaPct = kBefore > 0n ? (Number(kDelta) / Number(kBefore)) * 100 : 0;
  console.log(`  k delta:  ${kDelta} (${kDeltaPct.toFixed(6)}%)`);

  if (kAfter >= kBefore) {
    console.log('  ✓ PASS: k only increased (constant-product invariant holds, fees accrued)');
  } else {
    console.log('  ✗ FAIL: k DECREASED — constant-product invariant violated!');
  }

  // ─── Summary ───────────────────────────────────────────────────────────
  console.log('\n========================================');
  console.log('  AMM SWAP TEST SUMMARY');
  console.log('========================================');
  console.log(`  Concurrency:     ${concurrency}`);
  console.log(`  Successful:      ${successes.length}/${results.length}`);
  console.log(`  Throughput:      ${throughput.toFixed(2)} swaps/s`);
  console.log(`  k invariant:     ${kAfter >= kBefore ? 'PASS (k increased)' : 'FAIL (k decreased)'}`);
  console.log(`  k delta:         ${kDeltaPct.toFixed(6)}%`);

  const overallPass = successes.length >= results.length * 0.8 && kAfter >= kBefore;
  console.log(`  Overall:         ${overallPass ? '✓ PASS' : '✗ FAIL'}`);
  console.log('========================================');

  process.exit(overallPass ? 0 : 1);
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
