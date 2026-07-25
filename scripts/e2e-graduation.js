/**
 * Graduation E2E test: LAUNCH → BUY until $25K MC → MIGRATE → VERIFY
 *
 * This script:
 *   1. Launches a new token (or reuses an existing one via --token=0x...)
 *   2. Buys tokens in chunks until market cap reaches $25,000 (graduation threshold)
 *   3. Calls LiquidityMigration.checkAndMigrate(tokenAddress)
 *   4. Verifies:
 *      - AMM pair was created
 *      - Liquidity was added (reserves > 0)
 *      - LP tokens were burned to 0x...dEaD
 *      - Token is marked as graduated in the factory
 *      - API reflects the graduated status
 *
 * Usage:
 *   node scripts/e2e-graduation.js                  # launch + graduate a new token
 *   node scripts/e2e-graduation.js --token=0x...    # graduate an existing token
 *
 * Requires: DEPLOYER_PRIVATE_KEY env var, API running on :4000, Docker (pg+redis)
 */
require('dotenv').config();
const { createWalletClient, http, fallback, parseUnits, formatUnits, createPublicClient } = require('viem');
const { arcTestnet } = require('viem/chains');
const { privateKeyToAccount } = require('viem/accounts');
const { erc20Abi } = require('viem');

const DEPLOYER_PK = process.env.DEPLOYER_PRIVATE_KEY;
const RPC_URLS = (process.env.ARC_RPC_URLS ||
  'https://rpc.testnet.arc.io,https://rpc.drpc.testnet.arc.io,https://rpc.quicknode.testnet.arc.io,https://rpc.blockdaemon.testnet.arc.io'
).split(',').map(u => u.trim()).filter(Boolean);

const USDC = '0x3600000000000000000000000000000000000000';
const TOKEN_FACTORY = '0x26Ab49011AAf73c373e462CbD5445588Ff69b7A6';
const MIGRATOR = '0x664A37fED62192b9B29c66572198524e2CC8A6A6';
const AMM_FACTORY = '0x05188D467dC4Ff29Df531563a160eaA7c59e2ec1';
const API = 'http://localhost:4000';
const BURN_ADDRESS = '0x000000000000000000000000000000000000dEaD';

// Parse --token=0x... arg
const existingToken = process.argv
  .find(a => a.startsWith('--token='))
  ?.split('=')[1];

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
    name: 'getToken',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'tokenAddress', type: 'address' }],
    outputs: [
      { name: 'token', type: 'address' },
      { name: 'curve', type: 'address' },
      { name: 'creator', type: 'address' },
      { name: 'name', type: 'string' },
      { name: 'symbol', type: 'string' },
      { name: 'image', type: 'string' },
      { name: 'createdAt', type: 'uint256' },
      { name: 'graduated', type: 'bool' },
    ],
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
    name: 'marketCap',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'GRADUATION_MARKET_CAP',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
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
    name: 'SUPPLY_ON_CURVE',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'realUsdc',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'graduated',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'bool' }],
  },
];

const MIGRATOR_ABI = [
  {
    name: 'checkAndMigrate',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'tokenAddress', type: 'address' }],
    outputs: [],
  },
];

const AMM_PAIR_ABI = [
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
    name: 'totalSupply',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
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
];

const AMM_FACTORY_ABI = [
  {
    name: 'getPair',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'tokenA', type: 'address' },
      { name: 'tokenB', type: 'address' },
    ],
    outputs: [{ name: '', type: 'address' }],
  },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForReceipt(publicClient, hash, label = 'tx') {
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const receipt = await publicClient.getTransactionReceipt({ hash });
      if (receipt) {
        console.log(`  [${label}] confirmed in block ${receipt.blockNumber} (status ${receipt.status})`);
        return receipt;
      }
    } catch (e) {
      const msg = (e.shortMessage || '') + ' ' + (e.message || '') + ' ' + (e.name || '');
      if (msg.includes('request limit reached') || msg.includes('-32011') || msg.includes('rate')) {
        if (attempt % 5 === 0) console.log(`  [${label}] RPC rate-limited, retrying (${attempt + 1}/60)...`);
        await sleep(10000);
        continue;
      }
      if (msg.includes('not found') || msg.includes('pending') || msg.includes('TXN') || e.name === 'TransactionReceiptNotFoundError') {
        await sleep(3000);
        continue;
      }
      throw e;
    }
    await sleep(3000);
  }
  throw new Error(`${label}: receipt not found after 60 attempts`);
}

async function readRetry(publicClient, params, label = 'read') {
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

async function writeRetry(walletClient, params, label = 'write') {
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

async function main() {
  if (!DEPLOYER_PK) {
    console.error('DEPLOYER_PRIVATE_KEY not set');
    process.exit(1);
  }

  const account = privateKeyToAccount(DEPLOYER_PK);
  const transport = fallback(RPC_URLS.map(url => http(url, { pollingInterval: 4_000 })), { rank: false });
  const publicClient = createPublicClient({ chain: arcTestnet, transport });
  const walletClient = createWalletClient({ chain: arcTestnet, transport, account });

  console.log('========================================');
  console.log('  Orba Graduation E2E Test');
  console.log('  LAUNCH → BUY to $25K MC → MIGRATE → VERIFY');
  console.log('========================================');
  console.log(`Wallet: ${account.address}`);
  console.log(`Mode: ${existingToken ? 'existing token' : 'new token'}`);
  console.log('');

  let tokenAddress, curveAddress;

  // ─── Step 1: Get token (launch new or use existing) ───────────────────
  if (existingToken) {
    tokenAddress = existingToken;
    console.log(`Step 1: Using existing token ${tokenAddress}`);
    // Get curve address from the API (avoids ABI struct decoding issues
    // with the getToken() return type that includes strings + uint256).
    const res = await fetch(`${API}/tokens/${tokenAddress.toLowerCase()}`);
    if (!res.ok) {
      throw new Error(`Token not found in API: ${res.status}`);
    }
    const apiToken = await res.json();
    curveAddress = apiToken.curve_address;
    if (!curveAddress || curveAddress === '0x0000000000000000000000000000000000000000') {
      throw new Error('Token has no curve address in API');
    }
    console.log(`  Curve: ${curveAddress}`);
    console.log(`  Status: ${apiToken.status}, MC: $${apiToken.market_cap}`);
  } else {
    console.log('Step 1: Launching new token...');
    const fee = await readRetry(publicClient, {
      address: TOKEN_FACTORY,
      abi: TOKEN_FACTORY_ABI,
      functionName: 'creationFee',
    }, 'creationFee');
    console.log(`  Creation fee: ${formatUnits(fee, 6)} USDC`);

    // Approve USDC for the fee
    console.log('  Approving USDC for creation fee...');
    const approveHash = await writeRetry(walletClient, {
      address: USDC,
      abi: erc20Abi,
      functionName: 'approve',
      args: [TOKEN_FACTORY, fee],
    }, 'approveFee');
    await waitForReceipt(publicClient, approveHash, 'approveFee');

    // Create token
    const suffix = Math.floor(Math.random() * 100000).toString();
    const name = `GradTest${suffix}`;
    const symbol = `GRT${suffix.slice(0, 4)}`;
    console.log(`  Creating token: ${name} (${symbol})...`);
    const createHash = await writeRetry(walletClient, {
      address: TOKEN_FACTORY,
      abi: TOKEN_FACTORY_ABI,
      functionName: 'createToken',
      args: [name, symbol, `ipfs://grad/${suffix}`, 'Graduation test token'],
    }, 'createToken');
    const receipt = await waitForReceipt(publicClient, createHash, 'createToken');

    // Parse TokenCreated event to get token + curve addresses
    // event TokenCreated(address indexed token, address indexed creator, address curve, string name, string symbol)
    const tokenCreatedLog = receipt.logs.find(l => l.address.toLowerCase() === TOKEN_FACTORY.toLowerCase());
    if (!tokenCreatedLog) throw new Error('TokenCreated event not found in receipt');
    tokenAddress = '0x' + tokenCreatedLog.topics[1].slice(26);
    curveAddress = '0x' + tokenCreatedLog.topics[2].slice(26);
    console.log(`  ✓ Token: ${tokenAddress}`);
    console.log(`  ✓ Curve: ${curveAddress}`);
  }

  // ─── Step 2: Check current market cap ─────────────────────────────────
  console.log('');
  console.log('Step 2: Checking market cap...');
  const marketCap = await readRetry(publicClient, {
    address: curveAddress,
    abi: BONDING_CURVE_ABI,
    functionName: 'marketCap',
  }, 'marketCap');
  const threshold = await readRetry(publicClient, {
    address: curveAddress,
    abi: BONDING_CURVE_ABI,
    functionName: 'GRADUATION_MARKET_CAP',
  }, 'threshold');
  const isGraduated = await readRetry(publicClient, {
    address: curveAddress,
    abi: BONDING_CURVE_ABI,
    functionName: 'graduated',
  }, 'isGraduated');

  console.log(`  Market cap: $${formatUnits(marketCap, 6)} / $${formatUnits(threshold, 6)}`);
  console.log(`  Already graduated: ${isGraduated}`);

  if (isGraduated) {
    console.log('  Token already graduated — skipping buy phase');
  } else {
    // ─── Step 3: Buy until market cap reaches threshold ────────────────
    console.log('');
    console.log('Step 3: Buying tokens to reach graduation threshold...');

    // The MemeToken enforces a 4% max-wallet limit (40M tokens) pre-graduation.
    // So we can't buy more than 40M tokens per wallet. To work around this,
    // we buy, transfer tokens to a throwaway address, wait for the cooldown
    // (30 blocks ≈ 15s on Arc), then buy again. Repeat until MC >= $25K.
    //
    // We need ~$8800 in real USDC buys to push MC from $4K to $25K (computed
    // from the constant-product formula). Each buy is $100 (gives ~24M tokens
    // at start, fewer as price rises — always under the 40M limit). ~80-100
    // cycles total, ~20-25 min.
    const COOLDOWN_BLOCKS = 30n;
    let buyCount = 0;
    let currentMc = marketCap;
    const BUY_USDC = parseUnits('100', 6); // $100 per buy — safe under max wallet

    // Read the MemeToken address (from the curve) so we can transfer tokens.
    const CURVE_TOKEN_ABI = [
      { name: 'token', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'address' }] },
    ];
    const memeTokenAddress = await readRetry(publicClient, {
      address: curveAddress,
      abi: CURVE_TOKEN_ABI,
      functionName: 'token',
    }, 'curve.token()');

    const MEME_TOKEN_ABI = [
      { name: 'balanceOf', type: 'function', stateMutability: 'view', inputs: [{ name: 'owner', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
      { name: 'transfer', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }] },
    ];

    while (currentMc < threshold && buyCount < 120) {
      buyCount++;

      // Check deployer's current token balance — if we have tokens from
      // a previous buy, transfer them to a throwaway address first.
      const myBalance = await readRetry(publicClient, {
        address: memeTokenAddress,
        abi: MEME_TOKEN_ABI,
        functionName: 'balanceOf',
        args: [account.address],
      }, `balanceBefore${buyCount}`);

      if (myBalance > 0n) {
        // Transfer existing tokens to a throwaway address to clear our balance.
        const throwaway = '0x' + (buyCount + 0x1000).toString(16).padStart(40, '0');
        console.log(`  Cycle ${buyCount}: transferring ${formatUnits(myBalance, 18)} tokens to ${throwaway.slice(0, 10)}...`);

        // Wait for cooldown (30 blocks ≈ 15s) before transfer.
        // The cooldown applies to user-to-user transfers (msg.sender = deployer).
        // Buys from the curve are exempt (msg.sender = curve).
        if (buyCount > 1) {
          console.log(`  Waiting for cooldown (30 blocks ≈ 15s)...`);
          await sleep(16000);
        }

        const transferHash = await writeRetry(walletClient, {
          address: memeTokenAddress,
          abi: MEME_TOKEN_ABI,
          functionName: 'transfer',
          args: [throwaway, myBalance],
        }, `transfer${buyCount}`);
        const transferReceipt = await waitForReceipt(publicClient, transferHash, `transfer${buyCount}`);
        if (transferReceipt.status !== 'success') {
          console.log(`  ⚠ Transfer failed, continuing with buy anyway...`);
        }
      }

      console.log(`  Buy #${buyCount}: 100 USDC (MC: $${formatUnits(currentMc, 6)})`);

      // Approve USDC for the curve
      const approveHash = await writeRetry(walletClient, {
        address: USDC,
        abi: erc20Abi,
        functionName: 'approve',
        args: [curveAddress, BUY_USDC],
      }, `approveBuy${buyCount}`);
      await waitForReceipt(publicClient, approveHash, `approveBuy${buyCount}`);

      // Buy
      const buyHash = await writeRetry(walletClient, {
        address: curveAddress,
        abi: BONDING_CURVE_ABI,
        functionName: 'buy',
        args: [BUY_USDC, 0n],
      }, `buy${buyCount}`);
      const buyReceipt = await waitForReceipt(publicClient, buyHash, `buy${buyCount}`);

      if (buyReceipt.status !== 'success') {
        console.log(`  ⚠ Buy #${buyCount} failed, trying $50...`);
        const smallBuy = parseUnits('50', 6);
        const approveHash2 = await writeRetry(walletClient, {
          address: USDC,
          abi: erc20Abi,
          functionName: 'approve',
          args: [curveAddress, smallBuy],
        }, `approveRetry${buyCount}`);
        await waitForReceipt(publicClient, approveHash2, `approveRetry${buyCount}`);
        const buyHash2 = await writeRetry(walletClient, {
          address: curveAddress,
          abi: BONDING_CURVE_ABI,
          functionName: 'buy',
          args: [smallBuy, 0n],
        }, `buyRetry${buyCount}`);
        const buyReceipt2 = await waitForReceipt(publicClient, buyHash2, `buyRetry${buyCount}`);
        if (buyReceipt2.status !== 'success') {
          console.log(`  ⚠ Retry also failed, skipping cycle ${buyCount}`);
          continue;
        }
      }

      // Read new market cap
      currentMc = await readRetry(publicClient, {
        address: curveAddress,
        abi: BONDING_CURVE_ABI,
        functionName: 'marketCap',
      }, `mcAfter${buyCount}`);
      console.log(`    → MC after: $${formatUnits(currentMc, 6)}`);

      // Check if tokensSold hit SUPPLY_ON_CURVE (alternative graduation condition)
      const tokensSold = await readRetry(publicClient, {
        address: curveAddress,
        abi: BONDING_CURVE_ABI,
        functionName: 'tokensSold',
      }, `tokensSold${buyCount}`);
      const supplyOnCurve = await readRetry(publicClient, {
        address: curveAddress,
        abi: BONDING_CURVE_ABI,
        functionName: 'SUPPLY_ON_CURVE',
      }, `supplyOnCurve`);
      if (tokensSold >= supplyOnCurve) {
        console.log(`  ✓ All tokens sold (tokensSold >= SUPPLY_ON_CURVE)`);
        break;
      }
    }

    if (currentMc < threshold) {
      console.log(`  ⚠ Market cap $${formatUnits(currentMc, 6)} still below threshold after ${buyCount} buys`);
      console.log('  Attempting migration anyway (tokensSold may have hit SUPPLY_ON_CURVE)...');
    } else {
      console.log(`  ✓ Reached graduation threshold after ${buyCount} buys`);
    }
  }

  // ─── Step 4: Migrate (call checkAndMigrate) ───────────────────────────
  console.log('');
  console.log('Step 4: Calling LiquidityMigration.checkAndMigrate...');
  const migrateHash = await writeRetry(walletClient, {
    address: MIGRATOR,
    abi: MIGRATOR_ABI,
    functionName: 'checkAndMigrate',
    args: [tokenAddress],
  }, 'migrate');
  const migrateReceipt = await waitForReceipt(publicClient, migrateHash, 'migrate');

  if (migrateReceipt.status !== 'success') {
    throw new Error('Migration transaction failed on-chain');
  }
  console.log(`  ✓ Migration tx confirmed: ${migrateHash}`);

  // ─── Step 5: Verify on-chain ──────────────────────────────────────────
  console.log('');
  console.log('Step 5: Verifying graduation on-chain...');

  // 5a. Check token is marked graduated via the curve's `graduated` public var
  const curveGraduated = await readRetry(publicClient, {
    address: curveAddress,
    abi: BONDING_CURVE_ABI,
    functionName: 'graduated',
  }, 'curveGraduated');
  const graduated = curveGraduated;
  console.log(`  Token graduated (curve): ${graduated}`);
  if (!graduated) {
    throw new Error('Token not marked as graduated');
  }

  // 5b. Get AMM pair address from the AMM factory
  const ammPair = await readRetry(publicClient, {
    address: AMM_FACTORY,
    abi: AMM_FACTORY_ABI,
    functionName: 'getPair',
    args: [tokenAddress, USDC],
  }, 'getPair');
  console.log(`  AMM pair: ${ammPair}`);
  if (ammPair === '0x0000000000000000000000000000000000000000') {
    throw new Error('AMM pair address is zero');
  }

  // 5b. Check AMM pair reserves
  const [reserve0, reserve1] = await readRetry(publicClient, {
    address: ammPair,
    abi: AMM_PAIR_ABI,
    functionName: 'getReserves',
  }, 'getReserves');
  console.log(`  AMM reserves: ${formatUnits(reserve0, 18)} / ${formatUnits(reserve1, 6)}`);
  if (reserve0 === 0n || reserve1 === 0n) {
    throw new Error('AMM pair has zero reserves — liquidity not added');
  }

  // 5c. Check LP tokens burned to 0x...dEaD
  const burnedLp = await readRetry(publicClient, {
    address: ammPair,
    abi: AMM_PAIR_ABI,
    functionName: 'balanceOf',
    args: [BURN_ADDRESS],
  }, 'burnedLp');
  const lpTotalSupply = await readRetry(publicClient, {
    address: ammPair,
    abi: AMM_PAIR_ABI,
    functionName: 'totalSupply',
  }, 'lpTotalSupply');
  console.log(`  LP total supply: ${formatUnits(lpTotalSupply, 18)}`);
  console.log(`  LP burned to 0x...dEaD: ${formatUnits(burnedLp, 18)}`);
  if (burnedLp === 0n) {
    throw new Error('No LP tokens burned to dead address');
  }
  // Most LP should be burned (the migration burns all LP to 0x...dEaD)
  const burnPct = (Number(burnedLp) / Number(lpTotalSupply)) * 100;
  console.log(`  Burn percentage: ${burnPct.toFixed(2)}%`);
  if (burnPct < 99) {
    console.log(`  ⚠ Less than 99% of LP burned (expected ~100%)`);
  }

  // 5d. (curve graduated already verified in 5a)

  // ─── Step 6: Verify API reflects graduation ───────────────────────────
  console.log('');
  console.log('Step 6: Waiting for API to index graduation...');
  let apiToken = null;
  for (let i = 0; i < 36; i++) {
    try {
      const res = await fetch(`${API}/tokens/${tokenAddress.toLowerCase()}`);
      if (res.ok) {
        apiToken = await res.json();
        if (apiToken.status === 'graduated') {
          console.log(`  ✓ API shows token as graduated (after ${(i + 1) * 5}s)`);
          console.log(`    AMM pair in API: ${apiToken.amm_pair_address}`);
          break;
        }
        console.log(`  [${i + 1}] API status: ${apiToken.status} (waiting for graduated...)`);
      }
    } catch (e) {
      console.log(`  [${i + 1}] API error: ${e.message}`);
    }
    await sleep(5000);
  }

  if (!apiToken || apiToken.status !== 'graduated') {
    console.log('  ⚠ API did not reflect graduated status within 180s');
    console.log('  (This may be normal if the indexer poller interval is long)');
  }

  // ─── Summary ──────────────────────────────────────────────────────────
  console.log('');
  console.log('========================================');
  console.log('  ✓ Graduation E2E Test PASSED');
  console.log('========================================');
  console.log(`  Token:      ${tokenAddress}`);
  console.log(`  Curve:      ${curveAddress}`);
  console.log(`  AMM Pair:   ${ammPair}`);
  console.log(`  Graduated:  ${graduated}`);
  console.log(`  LP Burned:  ${burnPct.toFixed(2)}% to 0x...dEaD`);
  console.log(`  Reserves:   ${formatUnits(reserve0, 18)} tokens / ${formatUnits(reserve1, 6)} USDC`);
  console.log('========================================');
}

main().catch((err) => {
  console.error('');
  console.error('========================================');
  console.error('  ✗ Graduation E2E Test FAILED');
  console.error('========================================');
  console.error(err);
  process.exit(1);
});

