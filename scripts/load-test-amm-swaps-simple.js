/**
 * Simplified AMM swap test — sequential swaps from the deployer wallet.
 *
 * Tests the AMM swap logic + constant-product invariant without the complexity
 * of funding ephemeral wallets (which hits RPC rate limits). The deployer has
 * tokens from the graduation test buy, and USDC for the other side.
 *
 * Flow:
 *   1. Read AMM reserves + k before
 *   2. Do N buy swaps (USDC → token) sequentially
 *   3. Do N sell swaps (token → USDC) sequentially
 *   4. Read AMM reserves + k after
 *   5. Verify k only increased (fees accrued, invariant holds)
 *
 * Usage:
 *   node scripts/load-test-amm-swaps-simple.js [num-swaps=5] [usdc-per-swap=1]
 *
 * Requires: load-test-graduation.js to have run first.
 * ~$10 USDC cost for 5 buy + 5 sell swaps.
 */
require('dotenv').config();
if (process.env.ALLOW_UNSAFE_DIRECT_AMM_TEST !== 'true') {
  throw new Error(
    'This legacy script uses direct transfer-then-swap and is disabled. Use scripts/e2e-graduation.js with the authorized AMMRouter.',
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
const { privateKeyToAccount } = require('viem/accounts');
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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

const TOKEN_ABI = [
  { name: 'transfer', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }] },
  { name: 'balanceOf', type: 'function', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'approve', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }] },
];

async function readRetry(publicClient, params, label = 'read', maxAttempts = 10) {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await publicClient.readContract(params);
    } catch (e) {
      const msg = (e.shortMessage || '') + ' ' + (e.message || '');
      if (msg.includes('request limit reached') || msg.includes('-32011') || msg.includes('rate')) {
        if (attempt % 3 === 0) console.log(`  [${label}] RPC rate-limited, retrying (${attempt + 1}/${maxAttempts})...`);
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
        if (attempt % 3 === 0) console.log(`  [${label}] RPC rate-limited, retrying (${attempt + 1}/${maxAttempts})...`);
        await sleep(8000);
        continue;
      }
      throw e;
    }
  }
  throw new Error(`${label}: failed after ${maxAttempts} retries`);
}

async function waitForReceipt(publicClient, hash, label = 'tx', timeoutMs = 180000) {
  const start = Date.now();
  for (let attempt = 0; attempt < 90; attempt++) {
    if (Date.now() - start > timeoutMs) throw new Error(`${label}: receipt timeout after ${timeoutMs}ms`);
    try {
      const receipt = await publicClient.getTransactionReceipt({ hash });
      if (receipt) return receipt;
    } catch (e) {
      const msg = (e.shortMessage || '') + ' ' + (e.message || '') + ' ' + (e.name || '');
      if (msg.includes('request limit reached') || msg.includes('-32011') || msg.includes('rate')) {
        await sleep(10000);
        continue;
      }
      if (msg.includes('not found') || msg.includes('pending') || msg.includes('TXN') || e.name === 'TransactionReceiptNotFoundError') {
        await sleep(4000);
        continue;
      }
      throw e;
    }
    await sleep(4000);
  }
  throw new Error(`${label}: receipt not found after 90 attempts`);
}

async function main() {
  const numSwaps = parseInt(process.argv[2] || '5', 10);
  const usdcPerSwapStr = process.argv[3] || '1';
  const usdcPerSwap = parseUnits(usdcPerSwapStr, 6);

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

  const account = privateKeyToAccount(DEPLOYER_PK);
  const transport = fallback(RPC_URLS.map((url) => http(url, { pollingInterval: 4_000 })), { rank: false });
  const publicClient = createPublicClient({ chain: arcTestnet, transport });
  const walletClient = createWalletClient({ chain: arcTestnet, transport, account });

  console.log('========================================');
  console.log('  AMM Swap Test (Sequential)');
  console.log('========================================');
  console.log(`Token:        ${tokenAddress}`);
  console.log(`AMM Pair:     ${ammPair}`);
  console.log(`Swaps:        ${numSwaps} buys + ${numSwaps} sells`);
  console.log(`USDC/swap:    ${usdcPerSwapStr} USDC`);
  console.log(`Wallet:       ${account.address}`);
  console.log('');

  // Pre-flight
  console.log('--- Pre-flight ---');
  // Sync first — previous failed swaps may have left tokens in the pair with stale reserves
  try {
    const syncHash = await writeRetry(walletClient, { address: ammPair, abi: AMM_PAIR_ABI, functionName: 'sync' }, 'sync-init');
    await waitForReceipt(publicClient, syncHash, 'sync-init');
    console.log('  Synced pair (cleared stale reserves from failed swaps)');
  } catch (e) {
    console.log(`  ⚠ Initial sync failed: ${e.message}`);
  }

  const token0 = await readRetry(publicClient, { address: ammPair, abi: AMM_PAIR_ABI, functionName: 'token0' }, 'token0');
  const token1 = await readRetry(publicClient, { address: ammPair, abi: AMM_PAIR_ABI, functionName: 'token1' }, 'token1');
  const isUsdcToken0 = token0.toLowerCase() === USDC.toLowerCase();
  console.log(`  token0: ${token0} (${isUsdcToken0 ? 'USDC' : 'Token'})`);
  console.log(`  token1: ${token1} (${isUsdcToken0 ? 'Token' : 'USDC'})`);

  const [r0b, r1b] = await readRetry(publicClient, { address: ammPair, abi: AMM_PAIR_ABI, functionName: 'getReserves' }, 'reserves-before');
  const usdcReserveBefore = isUsdcToken0 ? r0b : r1b;
  const tokenReserveBefore = isUsdcToken0 ? r1b : r0b;
  const kBefore = BigInt(r0b) * BigInt(r1b);
  console.log(`  USDC reserve:  ${formatUnits(usdcReserveBefore, 6)} USDC`);
  console.log(`  Token reserve: ${formatUnits(tokenReserveBefore, 18)} tokens`);
  console.log(`  k before:      ${kBefore}`);
  console.log('');

  const deployerUsdc = await readRetry(publicClient, { address: USDC, abi: erc20Abi, functionName: 'balanceOf', args: [account.address] }, 'deployerUsdc');
  const deployerTokens = await readRetry(publicClient, { address: tokenAddress, abi: TOKEN_ABI, functionName: 'balanceOf', args: [account.address] }, 'deployerTokens');
  console.log(`  Deployer USDC:   ${formatUnits(deployerUsdc, 6)} USDC`);
  console.log(`  Deployer tokens: ${formatUnits(deployerTokens, 18)} tokens`);
  console.log('');

  let buySuccess = 0;
  let buyFail = 0;
  let sellSuccess = 0;
  let sellFail = 0;

  // ─── Buy swaps (USDC → token) ──────────────────────────────────────────
  console.log(`--- Buy swaps (USDC → token) ---`);
  for (let i = 0; i < numSwaps; i++) {
    try {
      // Read current reserves
      const [r0, r1] = await readRetry(publicClient, { address: ammPair, abi: AMM_PAIR_ABI, functionName: 'getReserves' }, `buy-${i}-reserves`);
      const usdcRes = isUsdcToken0 ? r0 : r1;
      const tokenRes = isUsdcToken0 ? r1 : r0;

      // Calculate output (0% fee — this AMM has no fee logic)
      // Correct 0% fee formula: amountOut = (amountIn * reserveOut) / (reserveIn + amountIn)
      // (NOT the Uniswap V2 0.3% formula with 997/1000)
      const tokenOut = (usdcPerSwap * tokenRes) / (usdcRes + usdcPerSwap);

      if (tokenOut === 0n) {
        console.log(`  [buy-${i + 1}] SKIP: output is 0`);
        buyFail++;
        continue;
      }

      // Approve USDC
      const approveHash = await writeRetry(walletClient, { address: USDC, abi: erc20Abi, functionName: 'approve', args: [ammPair, usdcPerSwap] }, `buy-${i}-approve`);
      await waitForReceipt(publicClient, approveHash, `buy-${i}-approve`);

      // Transfer USDC to pair
      const transferHash = await writeRetry(walletClient, { address: USDC, abi: erc20Abi, functionName: 'transfer', args: [ammPair, usdcPerSwap] }, `buy-${i}-transfer`);
      await waitForReceipt(publicClient, transferHash, `buy-${i}-transfer`);

      // Swap (3-arg, no data param — this AMM doesn't support flash swaps)
      const amount0Out = isUsdcToken0 ? 0n : tokenOut;
      const amount1Out = isUsdcToken0 ? tokenOut : 0n;
      const swapHash = await writeRetry(walletClient, { address: ammPair, abi: AMM_PAIR_ABI, functionName: 'swap', args: [amount0Out, amount1Out, account.address] }, `buy-${i}-swap`);
      const receipt = await waitForReceipt(publicClient, swapHash, `buy-${i}-swap`);

      if (receipt.status === 'success') {
        console.log(`  [buy-${i + 1}] ✓ ${usdcPerSwapStr} USDC → ${formatUnits(tokenOut, 18)} tokens`);
        buySuccess++;
      } else {
        console.log(`  [buy-${i + 1}] ✗ swap reverted`);
        buyFail++;
      }
    } catch (e) {
      console.log(`  [buy-${i + 1}] ✗ ${e.shortMessage || e.message}`);
      buyFail++;
    }
    await sleep(2000);
  }
  console.log(`  Buys: ${buySuccess} success, ${buyFail} fail`);
  console.log('');

  // ─── Sell swaps (token → USDC) ─────────────────────────────────────────
  console.log(`--- Sell swaps (token → USDC) ---`);
  // Calculate token amount equivalent to usdcPerSwap
  const [r0s, r1s] = await readRetry(publicClient, { address: ammPair, abi: AMM_PAIR_ABI, functionName: 'getReserves' }, 'sell-reserves');
  const usdcResForSell = isUsdcToken0 ? r0s : r1s;
  const tokenResForSell = isUsdcToken0 ? r1s : r0s;
  const tokenAmountPerSell = (usdcPerSwap * tokenResForSell) / usdcResForSell;
  console.log(`  Token amount per sell: ${formatUnits(tokenAmountPerSell, 18)} tokens (≈ ${usdcPerSwapStr} USDC)`);
  console.log('');

  for (let i = 0; i < numSwaps; i++) {
    try {
      const [r0, r1] = await readRetry(publicClient, { address: ammPair, abi: AMM_PAIR_ABI, functionName: 'getReserves' }, `sell-${i}-reserves`);
      const usdcRes = isUsdcToken0 ? r0 : r1;
      const tokenRes = isUsdcToken0 ? r1 : r0;

      // Calculate USDC output (0% fee — this AMM has no fee logic)
      // Correct 0% fee formula: amountOut = (amountIn * reserveOut) / (reserveIn + amountIn)
      const usdcOut = (tokenAmountPerSell * usdcRes) / (tokenRes + tokenAmountPerSell);

      if (usdcOut === 0n) {
        console.log(`  [sell-${i + 1}] SKIP: output is 0`);
        sellFail++;
        continue;
      }

      // Approve token
      const approveHash = await writeRetry(walletClient, { address: tokenAddress, abi: TOKEN_ABI, functionName: 'approve', args: [ammPair, tokenAmountPerSell] }, `sell-${i}-approve`);
      await waitForReceipt(publicClient, approveHash, `sell-${i}-approve`);

      // Transfer tokens to pair
      const transferHash = await writeRetry(walletClient, { address: tokenAddress, abi: TOKEN_ABI, functionName: 'transfer', args: [ammPair, tokenAmountPerSell] }, `sell-${i}-transfer`);
      await waitForReceipt(publicClient, transferHash, `sell-${i}-transfer`);

      // Swap (3-arg, no data param)
      const amount0Out = isUsdcToken0 ? usdcOut : 0n;
      const amount1Out = isUsdcToken0 ? 0n : usdcOut;
      const swapHash = await writeRetry(walletClient, { address: ammPair, abi: AMM_PAIR_ABI, functionName: 'swap', args: [amount0Out, amount1Out, account.address] }, `sell-${i}-swap`);
      const receipt = await waitForReceipt(publicClient, swapHash, `sell-${i}-swap`);

      if (receipt.status === 'success') {
        console.log(`  [sell-${i + 1}] ✓ ${formatUnits(tokenAmountPerSell, 18)} tokens → ${formatUnits(usdcOut, 6)} USDC`);
        sellSuccess++;
      } else {
        console.log(`  [sell-${i + 1}] ✗ swap reverted`);
        sellFail++;
      }
    } catch (e) {
      console.log(`  [sell-${i + 1}] ✗ ${e.shortMessage || e.message}`);
      sellFail++;
    }
    await sleep(2000);
  }
  console.log(`  Sells: ${sellSuccess} success, ${sellFail} fail`);
  console.log('');

  // ─── Verify k invariant ────────────────────────────────────────────────
  console.log('--- Verifying constant-product invariant ---');
  // Sync pair to update reserves
  try {
    const syncHash = await writeRetry(walletClient, { address: ammPair, abi: AMM_PAIR_ABI, functionName: 'sync' }, 'sync');
    await waitForReceipt(publicClient, syncHash, 'sync');
  } catch (e) {
    console.log(`  ⚠ Could not sync: ${e.message}`);
  }

  const [r0a, r1a] = await readRetry(publicClient, { address: ammPair, abi: AMM_PAIR_ABI, functionName: 'getReserves' }, 'reserves-after');
  const kAfter = BigInt(r0a) * BigInt(r1a);
  const kDelta = kAfter - kBefore;
  const kDeltaPct = kBefore > 0n ? (Number(kDelta) / Number(kBefore)) * 100 : 0;

  console.log(`  k before: ${kBefore}`);
  console.log(`  k after:  ${kAfter}`);
  console.log(`  k delta:  ${kDelta} (${kDeltaPct.toFixed(6)}%)`);

  const kPass = kAfter >= kBefore;
  console.log(`  ${kPass ? '✓ PASS' : '✗ FAIL'}: k ${kPass ? 'only increased' : 'DECREASED'} (constant-product invariant ${kPass ? 'holds' : 'violated'})`);
  console.log('');

  // ─── Summary ───────────────────────────────────────────────────────────
  console.log('========================================');
  console.log('  AMM SWAP TEST SUMMARY');
  console.log('========================================');
  console.log(`  Buy swaps:   ${buySuccess}/${numSwaps} success`);
  console.log(`  Sell swaps:  ${sellSuccess}/${numSwaps} success`);
  console.log(`  k invariant: ${kPass ? 'PASS' : 'FAIL'} (delta ${kDeltaPct.toFixed(6)}%)`);
  const overallPass = (buySuccess + sellSuccess) >= numSwaps && kPass;
  console.log(`  Overall:     ${overallPass ? '✓ PASS' : '✗ FAIL'}`);
  console.log('========================================');

  process.exit(overallPass ? 0 : 1);
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
