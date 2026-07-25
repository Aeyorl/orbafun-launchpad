/**
 * E2E sell test — sells tokens back to the bonding curve and verifies
 * the sell trade flows through Envio -> Hasura -> API -> DB.
 *
 * Run: node scripts/e2e-sell-test.js <curve-address> <token-amount>
 */
const { createWalletClient, http, fallback, parseUnits, formatUnits, createPublicClient } = require('viem');
const { arcTestnet } = require('viem/chains');
const { privateKeyToAccount } = require('viem/accounts');

const DEPLOYER_PK = process.env.DEPLOYER_PRIVATE_KEY;
// Rotate between all 4 Arc testnet RPC providers to avoid rate limits.
const RPC_URLS = (process.env.ARC_RPC_URLS ||
  'https://rpc.testnet.arc.io,https://rpc.drpc.testnet.arc.io,https://rpc.quicknode.testnet.arc.io,https://rpc.blockdaemon.testnet.arc.io'
).split(',').map(u => u.trim()).filter(Boolean);
const API = 'http://localhost:4000';

const BONDING_CURVE_ABI = [
  {
    name: 'sell',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'tokenAmount', type: 'uint256' },
      { name: 'minUsdcOut', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    name: 'quoteSell',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'tokenAmount', type: 'uint256' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'tokensSold',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
];

const ERC20_ABI = [
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
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
];

async function main() {
  const curve = process.argv[2] || '0x486ea7b6de154811fe1417b5ccd011d6b54bf258';
  const tokenAddr = process.argv[3] || '0xbb0a4483e90333f097ba68052afdd1f4e475bfe0';
  const tokenAmount = process.argv[4] || '100000'; // 100k tokens (18 dec)
  if (!DEPLOYER_PK) {
    console.error('DEPLOYER_PRIVATE_KEY not set');
    process.exit(1);
  }

  const account = privateKeyToAccount(DEPLOYER_PK);
  const transport = fallback(RPC_URLS.map(url => http(url, { pollingInterval: 4_000 })), { rank: false });
  const publicClient = createPublicClient({ chain: arcTestnet, transport });
  const walletClient = createWalletClient({
    chain: arcTestnet,
    transport,
    account,
  });

  console.log(`Wallet: ${account.address}`);
  console.log(`Curve:  ${curve}`);
  console.log(`Token:  ${tokenAddr}`);
  console.log(`Selling: ${tokenAmount} tokens (18 dec)`);

  const tokenParsed = parseUnits(tokenAmount, 18);

  // 0. Check token balance
  const balance = await publicClient.readContract({
    address: tokenAddr,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [account.address],
  });
  console.log(`Token balance: ${formatUnits(balance, 18)}`);

  // 1. Quote sell
  console.log('\n--- Quoting sell ---');
  const quote = await publicClient.readContract({
    address: curve,
    abi: BONDING_CURVE_ABI,
    functionName: 'quoteSell',
    args: [tokenParsed],
  });
  console.log(`Quote: ${formatUnits(quote, 6)} USDC for ${tokenAmount} tokens`);

  // 2. Approve BondingCurve to spend MemeTokens (required for sell)
  console.log('\n--- Approving MemeToken for BondingCurve ---');
  const approveTx = await walletClient.writeContract({
    address: tokenAddr,
    abi: ERC20_ABI,
    functionName: 'approve',
    args: [curve, tokenParsed],
  });
  console.log(`Approve tx: ${approveTx}`);
  const approveReceipt = await publicClient.waitForTransactionReceipt({ hash: approveTx });
  console.log(`Approve confirmed (status ${approveReceipt.status})`);

  // 3. Sell
  console.log('\n--- Selling tokens ---');
  const minOut = (quote * 95n) / 100n; // 5% slippage
  const sellTx = await walletClient.writeContract({
    address: curve,
    abi: BONDING_CURVE_ABI,
    functionName: 'sell',
    args: [tokenParsed, minOut],
  });
  console.log(`Sell tx: ${sellTx}`);
  const sellReceipt = await publicClient.waitForTransactionReceipt({ hash: sellTx });
  console.log(`Sell confirmed in block ${sellReceipt.blockNumber} (status ${sellReceipt.status})`);

  // 3. Read on-chain state
  const tokensSold = await publicClient.readContract({
    address: curve,
    abi: BONDING_CURVE_ABI,
    functionName: 'tokensSold',
  });
  console.log(`On-chain tokensSold after sell: ${formatUnits(tokensSold, 18)}`);

  // 4. Poll API for the sell trade
  console.log('\n--- Polling API for indexed sell trade ---');
  const start = Date.now();
  let found = false;
  for (let i = 0; i < 24; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    try {
      const res = await fetch(`${API}/tokens`);
      const { tokens } = await res.json();
      const token = tokens.find((t) => t.curve_address.toLowerCase() === curve.toLowerCase());
      if (!token) {
        console.log(`  [${i + 1}] token not found in API`);
        continue;
      }
      const tradesRes = await fetch(`${API}/tokens/${token.contract_address}/trades`);
      const tradesJson = await tradesRes.json();
      const trades = tradesJson.trades || [];
      const mySell = trades.find((t) => t.tx_hash?.toLowerCase() === sellTx.toLowerCase());
      console.log(
        `  [${i + 1}] token=${token.symbol} real_usdc=${formatUnits(BigInt(token.real_usdc), 6)} trades=${trades.length}`
      );
      if (mySell) {
        console.log(`\n✓ Sell trade indexed after ${((Date.now() - start) / 1000).toFixed(1)}s`);
        console.log(`  Trade: ${JSON.stringify(mySell)}`);
        found = true;
        break;
      }
    } catch (e) {
      console.log(`  [${i + 1}] API error: ${e.message}`);
    }
  }
  if (!found) {
    console.log(`\n✗ Sell trade did not appear in API within 120s`);
    process.exit(2);
  }
  console.log('\n=== E2E sell pipeline verified ===');
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
