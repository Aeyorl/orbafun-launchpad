/**
 * E2E trade pipeline test:
 *   1. Approve USDC for the bonding curve
 *   2. Buy tokens on the bonding curve
 *   3. Wait for on-chain confirmation
 *   4. Poll the NestJS API until the trade appears (Envio -> Hasura -> API -> DB)
 *
 * Run: node scripts/e2e-trade-test.js <curve-address> <usdc-amount>
 */
const { createWalletClient, http, fallback, parseUnits, formatUnits, createPublicClient } = require('viem');
const { arcTestnet } = require('viem/chains');
const { privateKeyToAccount } = require('viem/accounts');
const { erc20Abi } = require('viem');

const DEPLOYER_PK = process.env.DEPLOYER_PRIVATE_KEY;
// Rotate between all 4 Arc testnet RPC providers to avoid rate limits.
const RPC_URLS = (process.env.ARC_RPC_URLS ||
  'https://rpc.testnet.arc.io,https://rpc.drpc.testnet.arc.io,https://rpc.quicknode.testnet.arc.io,https://rpc.blockdaemon.testnet.arc.io'
).split(',').map(u => u.trim()).filter(Boolean);
const USDC = '0x3600000000000000000000000000000000000000';
const API = 'http://localhost:4000';

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
];

async function main() {
  const curve = process.argv[2] || '0x486ea7b6de154811fe1417b5ccd011d6b54bf258';
  const usdcAmount = process.argv[3] || '1'; // 1 USDC
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
  console.log(`Amount: ${usdcAmount} USDC`);

  const usdcParsed = parseUnits(usdcAmount, 6);

  // 1. Quote
  console.log('\n--- Quoting buy ---');
  const quote = await publicClient.readContract({
    address: curve,
    abi: BONDING_CURVE_ABI,
    functionName: 'quoteBuy',
    args: [usdcParsed],
  });
  console.log(`Quote: ${formatUnits(quote, 18)} tokens for ${usdcAmount} USDC`);

  // 2. Approve
  console.log('\n--- Approving USDC ---');
  const approveTx = await walletClient.writeContract({
    address: USDC,
    abi: erc20Abi,
    functionName: 'approve',
    args: [curve, usdcParsed],
  });
  console.log(`Approve tx: ${approveTx}`);
  const approveReceipt = await publicClient.waitForTransactionReceipt({ hash: approveTx });
  console.log(`Approve confirmed in block ${approveReceipt.blockNumber} (status ${approveReceipt.status})`);

  // 3. Buy
  console.log('\n--- Buying tokens ---');
  const minOut = (quote * 95n) / 100n; // 5% slippage
  const buyTx = await walletClient.writeContract({
    address: curve,
    abi: BONDING_CURVE_ABI,
    functionName: 'buy',
    args: [usdcParsed, minOut],
  });
  console.log(`Buy tx: ${buyTx}`);
  const buyReceipt = await publicClient.waitForTransactionReceipt({ hash: buyTx });
  console.log(`Buy confirmed in block ${buyReceipt.blockNumber} (status ${buyReceipt.status})`);

  // 4. Read on-chain state
  const tokensSold = await publicClient.readContract({
    address: curve,
    abi: BONDING_CURVE_ABI,
    functionName: 'tokensSold',
  });
  console.log(`On-chain tokensSold: ${formatUnits(tokensSold, 18)}`);

  // 5. Poll API for the trade
  console.log('\n--- Polling API for indexed trade ---');
  // Derive token address from curve (we know ejkjs mapping, but query API by curve)
  const start = Date.now();
  let found = false;
  for (let i = 0; i < 24; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    try {
      // Find the token whose curve_address matches
      const res = await fetch(`${API}/tokens`);
      const { tokens } = await res.json();
      const token = tokens.find((t) => t.curve_address.toLowerCase() === curve.toLowerCase());
      if (!token) {
        console.log(`  [${i + 1}] token not found in API yet`);
        continue;
      }
      const tradesRes = await fetch(`${API}/tokens/${token.contract_address}/trades`);
      const tradesJson = await tradesRes.json();
      const trades = tradesJson.trades || tradesJson;
      const myTrade = Array.isArray(trades)
        ? trades.find((t) => t.tx_hash?.toLowerCase() === buyTx.toLowerCase())
        : null;
      const realUsdc = BigInt(token.real_usdc);
      console.log(
        `  [${i + 1}] token=${token.symbol} real_usdc=${formatUnits(realUsdc, 6)} trades=${
          Array.isArray(trades) ? trades.length : '?'
        }`
      );
      if (myTrade) {
        console.log(`\n✓ Trade indexed by API after ${((Date.now() - start) / 1000).toFixed(1)}s`);
        console.log(`  Trade: ${JSON.stringify(myTrade)}`);
        found = true;
        break;
      }
      if (realUsdc > 0n && Array.isArray(trades) && trades.length > 0) {
        console.log(`\n✓ Trade appears indexed (real_usdc > 0, trades count > 0)`);
        console.log(`  Latest trade: ${JSON.stringify(trades[0])}`);
        found = true;
        break;
      }
    } catch (e) {
      console.log(`  [${i + 1}] API error: ${e.message}`);
    }
  }
  if (!found) {
    console.log(`\n✗ Trade did not appear in API within 120s`);
    process.exit(2);
  }
  console.log('\n=== E2E trade pipeline verified ===');
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
