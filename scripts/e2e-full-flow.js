/**
 * Full E2E flow test: LAUNCH -> BUY -> SELL
 * Verifies the complete pipeline from on-chain tx to indexed data in the API.
 *
 * Run: node scripts/e2e-full-flow.js
 */
require('dotenv').config();
const { createWalletClient, http, fallback, parseUnits, formatUnits, createPublicClient } = require('viem');
const { arcTestnet } = require('viem/chains');
const { privateKeyToAccount } = require('viem/accounts');
const { erc20Abi } = require('viem');

const DEPLOYER_PK = process.env.DEPLOYER_PRIVATE_KEY;
// Arc testnet has 4 public RPC providers with independent rate limits.
// We use viem's fallback transport to rotate between them automatically.
// Override via ARC_RPC_URLS env var (comma-separated).
const RPC_URLS = (process.env.ARC_RPC_URLS ||
  'https://rpc.testnet.arc.network,https://rpc.drpc.testnet.arc.network,https://rpc.quicknode.testnet.arc.network,https://rpc.blockdaemon.testnet.arc.network'
).split(',').map(u => u.trim()).filter(Boolean);
const USDC = '0x3600000000000000000000000000000000000000';
const TOKEN_FACTORY = process.env.ARC_TOKEN_FACTORY_ADDRESS;
const API = (process.env.E2E_API_URL || 'https://orbafun-api.onrender.com').replace(/\/$/, '');

const TOKEN_FACTORY_ABI = [
  {
    name: 'createToken',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'name', type: 'string' },
      { name: 'symbol', type: 'string' },
      { name: 'imageURI', type: 'string' },
      { name: 'description', type: 'string' },
    ],
    outputs: [
      { name: 'tokenAddress', type: 'address' },
      { name: 'curveAddress', type: 'address' },
    ],
  },
  {
    name: 'creationFee',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'getTokenCurve',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'token', type: 'address' }],
    outputs: [{ name: '', type: 'address' }],
  },
];

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
    name: 'quoteBuy',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'usdcAmount', type: 'uint256' }],
    outputs: [{ name: '', type: 'uint256' }],
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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Resilient receipt fetcher — Arc testnet RPC aggressively rate-limits.
// Polls with long intervals and retries on -32011.
async function waitForReceipt(publicClient, hash, label = 'tx') {
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const receipt = await publicClient.getTransactionReceipt({ hash });
      if (receipt) {
        console.log(`${label} confirmed in block ${receipt.blockNumber} (status ${receipt.status})`);
        return receipt;
      }
    } catch (e) {
      const msg = (e.shortMessage || '') + ' ' + (e.message || '') + ' ' + (e.name || '');
      if (msg.includes('request limit reached') || msg.includes('-32011') || msg.includes('rate')) {
        if (attempt % 5 === 0) console.log(`  [${label}] RPC rate-limited, retrying (${attempt + 1}/60)...`);
        await sleep(10000);
        continue;
      }
      // Receipt not found yet — tx still pending. Keep polling.
      if (msg.includes('not found') || msg.includes('pending') || msg.includes('TXN') || msg.includes('ReceiptNotFound') || e.name === 'TransactionReceiptNotFoundError') {
        await sleep(3000);
        continue;
      }
      throw e;
    }
    await sleep(3000);
  }
  throw new Error(`${label}: receipt not found after 60 attempts`);
}

// Resilient contract read with retry on rate-limit
async function readContractRetry(publicClient, params, label = 'read') {
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      return await publicClient.readContract(params);
    } catch (e) {
      const msg = e.shortMessage || e.message || '';
      if (msg.includes('request limit reached') || msg.includes('-32011') || msg.includes('rate')) {
        console.log(`  [${label}] RPC rate-limited, retrying (${attempt + 1}/10)...`);
        await sleep(8000);
        continue;
      }
      throw e;
    }
  }
  throw new Error(`${label}: failed after 10 retries`);
}

// Resilient write with retry on rate-limit
async function writeContractRetry(walletClient, params, label = 'write') {
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      return await walletClient.writeContract(params);
    } catch (e) {
      const msg = e.shortMessage || e.message || '';
      if (msg.includes('request limit reached') || msg.includes('-32011') || msg.includes('rate')) {
        console.log(`  [${label}] RPC rate-limited, retrying (${attempt + 1}/10)...`);
        await sleep(8000);
        continue;
      }
      throw e;
    }
  }
  throw new Error(`${label}: failed after 10 retries`);
}

async function waitForTrade(txHash, curve, label) {
  const start = Date.now();
  for (let i = 0; i < 36; i++) {
    await sleep(5000);
    try {
      const res = await fetch(`${API}/tokens`);
      const { tokens } = await res.json();
      const token = tokens.find((t) => t.curve_address.toLowerCase() === curve.toLowerCase());
      if (!token) {
        console.log(`  [${i + 1}] ${label}: token not yet in API`);
        continue;
      }
      const tradesRes = await fetch(`${API}/tokens/${token.contract_address}/trades`);
      const tradesJson = await tradesRes.json();
      const trades = tradesJson.trades || [];
      const myTrade = trades.find((t) => t.tx_hash?.toLowerCase() === txHash.toLowerCase());
      console.log(
        `  [${i + 1}] ${label}: token=${token.symbol} price=${token.price} mc=${token.market_cap} real_usdc=${formatUnits(BigInt(token.real_usdc), 6)} trades=${trades.length}`
      );
      if (myTrade) {
        console.log(`✓ ${label} indexed after ${((Date.now() - start) / 1000).toFixed(1)}s`);
        return { token, trade: myTrade };
      }
    } catch (e) {
      console.log(`  [${i + 1}] ${label}: API error: ${e.message}`);
    }
  }
  throw new Error(`${label} did not appear in API within 180s`);
}

async function main() {
  if (!DEPLOYER_PK) {
    console.error('DEPLOYER_PRIVATE_KEY not set');
    process.exit(1);
  }

  const account = privateKeyToAccount(DEPLOYER_PK);
  // Use fallback transport so rate-limit errors on one provider automatically
  // retry on the next. This eliminates the long "rate-limited, retrying..."
  // waits that happened with a single provider.
  const transport = fallback(RPC_URLS.map(url => http(url, { pollingInterval: 4_000 })), { rank: false });
  const publicClient = createPublicClient({ chain: arcTestnet, transport });
  const walletClient = createWalletClient({
    chain: arcTestnet,
    transport,
    account,
  });

  console.log('========================================');
  console.log('  Orba Full E2E Flow Test');
  console.log('  LAUNCH -> BUY -> SELL');
  console.log('========================================');
  console.log(`Wallet: ${account.address}`);

  // ─── LAUNCH ────────────────────────────────────────────────────────────
  console.log('\n--- STEP 1: LAUNCH ---');
  const name = `TestE2E${Date.now().toString().slice(-6)}`;
  const symbol = `E2E${Math.floor(Math.random() * 1000)}`;
  console.log(`Launching token: ${name} (${symbol})`);

  const creationFee = await readContractRetry(publicClient, {
    address: TOKEN_FACTORY,
    abi: TOKEN_FACTORY_ABI,
    functionName: 'creationFee',
  });
  console.log(`Creation fee: ${formatUnits(creationFee, 6)} USDC (pulled via transferFrom)`);

  // Approve USDC for TokenFactory (creation fee is pulled via transferFrom)
  const feeApproveTx = await writeContractRetry(walletClient, {
    address: USDC,
    abi: erc20Abi,
    functionName: 'approve',
    args: [TOKEN_FACTORY, creationFee],
  });
  await waitForReceipt(publicClient, feeApproveTx, "feeApproveTx");
  console.log(`USDC approved for creation fee`);

  // createToken(name, symbol, imageURI, description)
  const launchTx = await writeContractRetry(walletClient, {
    address: TOKEN_FACTORY,
    abi: TOKEN_FACTORY_ABI,
    functionName: 'createToken',
    args: [name, symbol, 'ipfs://test/e2e', 'E2E test token'],
  });
  console.log(`Launch tx: ${launchTx}`);
  const launchReceipt = await waitForReceipt(publicClient, launchTx, "launchTx");
  console.log(`Launch confirmed in block ${launchReceipt.blockNumber} (status ${launchReceipt.status})`);

  // Parse TokenCreated event from receipt logs
  const tokenCreatedEvent = launchReceipt.logs.find(
    (l) => l.topics[0] && l.address.toLowerCase() === TOKEN_FACTORY.toLowerCase()
  );
  if (!tokenCreatedEvent) throw new Error('TokenCreated event not found in receipt');

  // TokenCreated(address indexed token, address indexed curve, address indexed creator, ...)
  const tokenAddress = '0x' + tokenCreatedEvent.topics[1].slice(26);
  const curveAddress = '0x' + tokenCreatedEvent.topics[2].slice(26);
  console.log(`Token: ${tokenAddress}`);
  console.log(`Curve:  ${curveAddress}`);

  // Wait for launch to be indexed
  console.log('\nWaiting for launch to be indexed...');
  let launchIndexed = false;
  for (let i = 0; i < 36; i++) {
    await sleep(5000);
    try {
      const res = await fetch(`${API}/tokens/${tokenAddress}`);
      if (res.ok) {
        const token = await res.json();
        console.log(`✓ Launch indexed after ${(i + 1) * 5}s: ${token.name} (${token.symbol})`);
        launchIndexed = true;
        break;
      }
      console.log(`  [${i + 1}] launch not yet indexed`);
    } catch (e) {
      console.log(`  [${i + 1}] API error: ${e.message}`);
    }
  }
  if (!launchIndexed) throw new Error('Launch did not appear in API within 180s');

  // ─── BUY ───────────────────────────────────────────────────────────────
  console.log('\n--- STEP 2: BUY ---');
  const buyAmount = '2'; // 2 USDC
  const buyParsed = parseUnits(buyAmount, 6);
  console.log(`Buying with ${buyAmount} USDC`);

  const buyQuote = await readContractRetry(publicClient, {
    address: curveAddress,
    abi: BONDING_CURVE_ABI,
    functionName: 'quoteBuy',
    args: [buyParsed],
  });
  console.log(`Quote: ${formatUnits(buyQuote, 18)} tokens for ${buyAmount} USDC`);

  // Approve USDC
  const approveTx = await writeContractRetry(walletClient, {
    address: USDC,
    abi: erc20Abi,
    functionName: 'approve',
    args: [curveAddress, buyParsed],
  });
  await waitForReceipt(publicClient, approveTx, "approveTx");
  console.log(`USDC approved`);

  // Buy
  const minTokensOut = (buyQuote * 95n) / 100n;
  const buyTx = await writeContractRetry(walletClient, {
    address: curveAddress,
    abi: BONDING_CURVE_ABI,
    functionName: 'buy',
    args: [buyParsed, minTokensOut],
  });
  console.log(`Buy tx: ${buyTx}`);
  const buyReceipt = await waitForReceipt(publicClient, buyTx, "buyTx");
  console.log(`Buy confirmed in block ${buyReceipt.blockNumber} (status ${buyReceipt.status})`);

  // Wait for buy to be indexed
  console.log('\nWaiting for buy to be indexed...');
  const buyResult = await waitForTrade(buyTx, curveAddress, 'BUY');

  // ─── SELL ──────────────────────────────────────────────────────────────
  console.log('\n--- STEP 3: SELL ---');
  const sellAmount = formatUnits(buyResult.trade.token_amount, 18).split('.')[0]; // sell what we bought (whole tokens)
  const sellParsed = BigInt(buyResult.trade.token_amount) / 2n; // sell half
  console.log(`Selling ${formatUnits(sellParsed, 18)} tokens`);

  const sellQuote = await readContractRetry(publicClient, {
    address: curveAddress,
    abi: BONDING_CURVE_ABI,
    functionName: 'quoteSell',
    args: [sellParsed],
  });
  console.log(`Quote: ${formatUnits(sellQuote, 6)} USDC for sell`);

  // Approve MemeToken for BondingCurve
  const tokenApproveTx = await writeContractRetry(walletClient, {
    address: tokenAddress,
    abi: erc20Abi,
    functionName: 'approve',
    args: [curveAddress, sellParsed],
  });
  await waitForReceipt(publicClient, tokenApproveTx, "tokenApproveTx");
  console.log(`MemeToken approved`);

  // Sell
  const minUsdcOut = (sellQuote * 95n) / 100n;
  const sellTx = await writeContractRetry(walletClient, {
    address: curveAddress,
    abi: BONDING_CURVE_ABI,
    functionName: 'sell',
    args: [sellParsed, minUsdcOut],
  });
  console.log(`Sell tx: ${sellTx}`);
  const sellReceipt = await waitForReceipt(publicClient, sellTx, "sellTx");
  console.log(`Sell confirmed in block ${sellReceipt.blockNumber} (status ${sellReceipt.status})`);

  // Wait for sell to be indexed
  console.log('\nWaiting for sell to be indexed...');
  const sellResult = await waitForTrade(sellTx, curveAddress, 'SELL');

  // ─── SUMMARY ───────────────────────────────────────────────────────────
  console.log('\n========================================');
  console.log('  E2E Test Results');
  console.log('========================================');
  console.log(`Token: ${name} (${symbol})`);
  console.log(`  Address: ${tokenAddress}`);
  console.log(`  Curve:   ${curveAddress}`);
  console.log(`  Price:   ${sellResult.token.price} USDC`);
  console.log(`  MC:      ${sellResult.token.market_cap} USDC`);
  console.log(`  Real USDC in curve: ${formatUnits(BigInt(sellResult.token.real_usdc), 6)}`);
  console.log(`  Tokens sold:        ${formatUnits(BigInt(sellResult.token.tokens_sold), 18)}`);
  console.log(`  Total trades:       2 (1 buy, 1 sell)`);
  console.log('\n✓ FULL E2E FLOW VERIFIED: launch -> buy -> sell');
  console.log('========================================');
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
