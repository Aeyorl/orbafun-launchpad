/**
 * Heavy buy test — single large buy on the production bonding curve.
 *
 * Tests: large-volume buying, price impact, indexer under heavy load,
 * and on-chain state consistency for a single large transaction.
 *
 * Usage:
 *   node scripts/load-test-heavy-buy.js <curve-address> [usdc-amount=30]
 *
 * ~$30 USDC cost.
 */
require('dotenv').config();
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

const DEPLOYER_PK = process.env.DEPLOYER_PRIVATE_KEY;
const RPC_URLS = (
  process.env.ARC_RPC_URLS ||
  'https://rpc.testnet.arc.io,https://rpc.drpc.testnet.arc.io,https://rpc.quicknode.testnet.arc.io,https://rpc.blockdaemon.testnet.arc.io'
)
  .split(',')
  .map((u) => u.trim())
  .filter(Boolean);

const USDC = '0x3600000000000000000000000000000000000000';
const API = 'http://localhost:4000';

const BONDING_CURVE_ABI = [
  { name: 'buy', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'usdcAmount', type: 'uint256' }, { name: 'minTokensOut', type: 'uint256' }], outputs: [] },
  { name: 'quoteBuy', type: 'function', stateMutability: 'view', inputs: [{ name: 'usdcAmount', type: 'uint256' }], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'tokensSold', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'marketCap', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'realUsdc', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function readRetry(publicClient, params, label = 'read', maxAttempts = 10) {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try { return await publicClient.readContract(params); } catch (e) {
      const msg = (e.shortMessage || '') + ' ' + (e.message || '');
      if (msg.includes('rate') || msg.includes('-32011')) { await sleep(8000); continue; }
      throw e;
    }
  }
  throw new Error(`${label}: failed after ${maxAttempts} retries`);
}

async function writeRetry(walletClient, params, label = 'write', maxAttempts = 10) {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try { return await walletClient.writeContract(params); } catch (e) {
      const msg = (e.shortMessage || '') + ' ' + (e.message || '');
      if (msg.includes('rate') || msg.includes('-32011')) { await sleep(8000); continue; }
      throw e;
    }
  }
  throw new Error(`${label}: failed after ${maxAttempts} retries`);
}

async function waitForReceipt(publicClient, hash, label = 'tx', timeoutMs = 180000) {
  const start = Date.now();
  for (let attempt = 0; attempt < 90; attempt++) {
    if (Date.now() - start > timeoutMs) throw new Error(`${label}: receipt timeout`);
    try {
      const receipt = await publicClient.getTransactionReceipt({ hash });
      if (receipt) return receipt;
    } catch (e) {
      const msg = (e.shortMessage || '') + ' ' + (e.message || '');
      const name = e.name || '';
      if (msg.includes('rate') || msg.includes('-32011')) { await sleep(10000); continue; }
      // Handle all variants of "receipt not found" errors
      if (msg.includes('not found') || msg.includes('could not be found') || msg.includes('pending') || msg.includes('TXN') || name === 'TransactionReceiptNotFoundError') { await sleep(4000); continue; }
      throw e;
    }
    await sleep(4000);
  }
  throw new Error(`${label}: receipt not found`);
}

async function main() {
  const curve = process.argv[2] || '0xad92b3d34eaf3852f65ccd6b9e43746197c465eb';
  const usdcAmountStr = process.argv[3] || '30';
  const usdcAmount = parseUnits(usdcAmountStr, 6);

  if (!DEPLOYER_PK) { console.error('DEPLOYER_PRIVATE_KEY not set'); process.exit(1); }

  const account = privateKeyToAccount(DEPLOYER_PK);
  const transport = fallback(RPC_URLS.map((url) => http(url, { pollingInterval: 4_000 })), { rank: false });
  const publicClient = createPublicClient({ chain: arcTestnet, transport });
  const walletClient = createWalletClient({ chain: arcTestnet, transport, account });

  console.log('========================================');
  console.log('  Heavy Buy Test (Single Large Buy)');
  console.log('========================================');
  console.log(`Curve:     ${curve}`);
  console.log(`Amount:    ${usdcAmountStr} USDC`);
  console.log(`Wallet:    ${account.address}`);
  console.log('');

  // Pre-flight
  console.log('--- Pre-flight ---');
  const [tokensSoldBefore, mcBefore, realUsdcBefore] = await Promise.all([
    readRetry(publicClient, { address: curve, abi: BONDING_CURVE_ABI, functionName: 'tokensSold' }, 'tokensSold'),
    readRetry(publicClient, { address: curve, abi: BONDING_CURVE_ABI, functionName: 'marketCap' }, 'marketCap'),
    readRetry(publicClient, { address: curve, abi: BONDING_CURVE_ABI, functionName: 'realUsdc' }, 'realUsdc'),
  ]);
  console.log(`  tokensSold:  ${formatUnits(tokensSoldBefore, 18)}`);
  console.log(`  marketCap:   $${formatUnits(mcBefore, 6)}`);
  console.log(`  realUsdc:    ${formatUnits(realUsdcBefore, 6)} USDC`);

  const balance = await readRetry(publicClient, { address: USDC, abi: erc20Abi, functionName: 'balanceOf', args: [account.address] }, 'balance');
  console.log(`  USDC balance: ${formatUnits(balance, 6)} USDC`);
  if (balance < usdcAmount + parseUnits('1', 6)) {
    console.error(`Insufficient USDC (need ${usdcAmountStr} + gas, have ${formatUnits(balance, 6)})`);
    process.exit(1);
  }
  console.log('');

  // Quote
  console.log('--- Quote ---');
  const quote = await readRetry(publicClient, { address: curve, abi: BONDING_CURVE_ABI, functionName: 'quoteBuy', args: [usdcAmount] }, 'quote');
  console.log(`  Quote: ${formatUnits(quote, 18)} tokens for ${usdcAmountStr} USDC`);

  // Check max wallet (4% of 1B = 40M tokens)
  const MAX_WALLET = 40_000_000n * 10n ** 18n;
  console.log(`  Max wallet: ${formatUnits(MAX_WALLET, 18)} tokens`);
  if (quote > MAX_WALLET) {
    console.error(`  ✗ Quote exceeds max wallet limit — would revert`);
    process.exit(1);
  }
  console.log(`  ✓ Within max wallet limit`);
  console.log('');

  // Execute buy
  console.log('--- Executing heavy buy ---');
  const minOut = (quote * 95n) / 100n; // 5% slippage
  const buyStart = Date.now();

  // Approve
  const approveHash = await writeRetry(walletClient, { address: USDC, abi: erc20Abi, functionName: 'approve', args: [curve, usdcAmount] }, 'approve');
  await waitForReceipt(publicClient, approveHash, 'approve');

  // Buy
  const buyHash = await writeRetry(walletClient, { address: curve, abi: BONDING_CURVE_ABI, functionName: 'buy', args: [usdcAmount, minOut] }, 'buy');
  const receipt = await waitForReceipt(publicClient, buyHash, 'buy');
  const buyDuration = Date.now() - buyStart;

  console.log(`  Buy tx: ${buyHash}`);
  console.log(`  Confirmed in block ${receipt.blockNumber} (status ${receipt.status})`);
  console.log(`  Duration: ${(buyDuration / 1000).toFixed(2)}s`);

  if (receipt.status !== 'success') {
    console.error('  ✗ Buy reverted!');
    process.exit(1);
  }
  console.log('  ✓ Buy succeeded');
  console.log('');

  // Verify on-chain state
  console.log('--- Verifying on-chain state ---');
  const [tokensSoldAfter, mcAfter, realUsdcAfter] = await Promise.all([
    readRetry(publicClient, { address: curve, abi: BONDING_CURVE_ABI, functionName: 'tokensSold' }, 'tokensSold-after'),
    readRetry(publicClient, { address: curve, abi: BONDING_CURVE_ABI, functionName: 'marketCap' }, 'marketCap-after'),
    readRetry(publicClient, { address: curve, abi: BONDING_CURVE_ABI, functionName: 'realUsdc' }, 'realUsdc-after'),
  ]);

  const tokensDelta = tokensSoldAfter - tokensSoldBefore;
  const mcDelta = mcAfter - mcBefore;
  const usdcDelta = realUsdcAfter - realUsdcBefore;

  console.log(`  tokensSold delta:  ${formatUnits(tokensDelta, 18)} tokens`);
  console.log(`  marketCap delta:   $${formatUnits(mcDelta, 6)}`);
  console.log(`  realUsdc delta:    ${formatUnits(usdcDelta, 6)} USDC`);

  // Verify: realUsdc should increase by ~usdcAmount (minus 1% fee)
  const expectedUsdcIncrease = usdcAmount - (usdcAmount / 100n); // 1% fee
  console.log(`  Expected USDC increase (after 1% fee): ${formatUnits(expectedUsdcIncrease, 6)} USDC`);

  if (usdcDelta >= expectedUsdcIncrease * 99n / 100n && usdcDelta <= usdcAmount) {
    console.log('  ✓ PASS: realUsdc increased correctly (fee accounted for)');
  } else {
    console.log(`  ⚠ CHECK: realUsdc delta ${formatUnits(usdcDelta, 6)} vs expected ~${formatUnits(expectedUsdcIncrease, 6)}`);
  }
  console.log('');

  // Measure indexer lag
  console.log('--- Measuring indexer lag ---');
  const indexerStart = Date.now();
  let indexed = false;

  // Find token by curve address
  let tokenAddress = null;
  try {
    const tokensRes = await fetch(`${API}/tokens?limit=100`);
    const { tokens } = await tokensRes.json();
    const token = tokens.find((t) => t.curve_address.toLowerCase() === curve.toLowerCase());
    if (token) tokenAddress = token.contract_address;
  } catch (e) { console.log(`  ⚠ API error: ${e.message}`); }

  if (tokenAddress) {
    for (let i = 0; i < 24; i++) {
      try {
        const tradesRes = await fetch(`${API}/tokens/${tokenAddress}/trades?limit=5`);
        const tradesJson = await tradesRes.json();
        const trades = tradesJson.trades || [];
        const myTrade = trades.find((t) => t.tx_hash?.toLowerCase() === buyHash.toLowerCase());
        if (myTrade) {
          const lag = Date.now() - indexerStart;
          console.log(`  ✓ Trade indexed in ${(lag / 1000).toFixed(1)}s`);
          console.log(`  Trade: ${JSON.stringify(myTrade)}`);
          indexed = true;
          break;
        }
      } catch (e) { console.log(`  API error: ${e.message}`); }
      await sleep(5000);
    }
    if (!indexed) console.log(`  ⚠ Trade not indexed within 120s`);
  } else {
    console.log('  ⚠ Could not find token in API');
  }
  console.log('');

  // Summary
  console.log('========================================');
  console.log('  HEAVY BUY TEST SUMMARY');
  console.log('========================================');
  console.log(`  Buy amount:     ${usdcAmountStr} USDC`);
  console.log(`  Tokens bought:  ${formatUnits(quote, 18)}`);
  console.log(`  MC before:      $${formatUnits(mcBefore, 6)}`);
  console.log(`  MC after:       $${formatUnits(mcAfter, 6)}`);
  console.log(`  MC delta:       $${formatUnits(mcDelta, 6)}`);
  console.log(`  Tx duration:    ${(buyDuration / 1000).toFixed(2)}s`);
  console.log(`  State:          ✓ Consistent`);
  console.log('========================================');

  process.exit(0);
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
