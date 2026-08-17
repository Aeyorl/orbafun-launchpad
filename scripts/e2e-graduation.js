/**
 * Graduation E2E test: LAUNCH → BUY → MIGRATE → AMM SWAPS → VERIFY
 *
 * This script:
 *   1. Launches a new token (or reuses an existing one via --token=0x...)
 *   2. Buys tokens in chunks until market cap reaches $25,000 (graduation threshold)
 *   3. Verifies automatic migration from the threshold-crossing buy (and
 *      supports the legacy manual migration path for already-deployed curves)
 *   4. Buys and sells through the AMM router
 *   5. Verifies:
 *      - AMM pair was created
 *      - Liquidity was added (reserves > 0)
 *      - LP tokens were burned to 0x...dEaD
 *      - Token is marked as graduated in the factory
 *      - API reflects graduation, LP burn, swaps, candles, and volume
 *
 * Usage:
 *   node scripts/e2e-graduation.js                  # launch + graduate a new token
 *   node scripts/e2e-graduation.js --token=0x...    # graduate an existing token
 *
 * Requires: DEPLOYER_PRIVATE_KEY, ARC_TOKEN_FACTORY_ADDRESS,
 * ARC_MIGRATOR_ADDRESS, ARC_AMM_FACTORY_ADDRESS, ARC_AMM_ROUTER_ADDRESS,
 * and E2E_API_URL. E2E_BUY_USDC defaults to 1000 for the uncapped factory.
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
function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required; refusing to use stale deployment defaults`);
  return value;
}

const TOKEN_FACTORY = requiredEnv('ARC_TOKEN_FACTORY_ADDRESS');
const MIGRATOR = requiredEnv('ARC_MIGRATOR_ADDRESS');
const AMM_FACTORY = requiredEnv('ARC_AMM_FACTORY_ADDRESS');
const AMM_ROUTER = requiredEnv('ARC_AMM_ROUTER_ADDRESS');
const API = requiredEnv('E2E_API_URL').replace(/\/$/, '');
const BURN_ADDRESS = '0x000000000000000000000000000000000000dEaD';
const MINIMUM_LIQUIDITY = 1000n;

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
      {
        name: '',
        type: 'tuple',
        components: [
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
  {
    name: 'getAmmPair',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'tokenAddress', type: 'address' }],
    outputs: [{ name: '', type: 'address' }],
  },
];

const MEME_TOKEN_ABI = [
  {
    name: 'graduated', type: 'function', stateMutability: 'view', inputs: [],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'owner', type: 'function', stateMutability: 'view', inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    name: 'bondingCurve', type: 'function', stateMutability: 'view', inputs: [],
    outputs: [{ name: '', type: 'address' }],
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

const AMM_ROUTER_ABI = [
  {
    name: 'swapExactUSDCForTokens',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'amountIn', type: 'uint256' },
      { name: 'amountOutMin', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
      { name: 'pair', type: 'address' },
      { name: 'to', type: 'address' },
    ],
    outputs: [{ name: 'amountOut', type: 'uint256' }],
  },
  {
    name: 'swapExactTokensForUSDC',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'amountIn', type: 'uint256' },
      { name: 'amountOutMin', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
      { name: 'pair', type: 'address' },
      { name: 'to', type: 'address' },
    ],
    outputs: [{ name: 'amountOut', type: 'uint256' }],
  },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fetchApi = (path) => fetch(`${API}${path}`, { signal: AbortSignal.timeout(15_000) });

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
  const buyChunkText = process.env.E2E_BUY_USDC?.trim() || '1000';
  const buyChunk = parseUnits(buyChunkText, 6);
  if (buyChunk <= 0n || buyChunk > parseUnits('2000', 6)) {
    throw new Error('E2E_BUY_USDC must be greater than 0 and no more than 2000 USDC');
  }
  const startingBalance = await publicClient.readContract({
    address: USDC,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [account.address],
  });
  if (!existingToken && startingBalance < parseUnits('9200', 6)) {
    throw new Error(`Funded canary requires at least 9200 USDC; wallet has ${formatUnits(startingBalance, 6)}`);
  }

  console.log('========================================');
  console.log('  Orba Graduation E2E Test');
  console.log('  LAUNCH → BUY to $25K MC → MIGRATE → VERIFY');
  console.log('========================================');
  console.log(`Wallet: ${account.address}`);
  console.log(`Starting balance: ${formatUnits(startingBalance, 6)} USDC`);
  console.log(`Bonding-curve buy chunk: ${buyChunkText} USDC (maximum 2000)`);
  console.log(`Mode: ${existingToken ? 'existing token' : 'new token'}`);
  console.log('');

  let tokenAddress, curveAddress;

  // ─── Step 1: Get token (launch new or use existing) ───────────────────
  if (existingToken) {
    tokenAddress = existingToken;
    console.log(`Step 1: Using existing token ${tokenAddress}`);
    // Get curve address from the API (avoids ABI struct decoding issues
    // with the getToken() return type that includes strings + uint256).
    const res = await fetchApi(`/tokens/${tokenAddress.toLowerCase()}`);
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

    // This canary targets the uncapped factory. Use bounded chunks so it tests
    // multiple price steps without the legacy max-wallet transfer workaround.
    let buyCount = 0;
    let currentMc = marketCap;
    while (currentMc < threshold && buyCount < 12) {
      buyCount++;
      console.log(`  Buy #${buyCount}: ${buyChunkText} USDC max (MC: $${formatUnits(currentMc, 6)})`);

      // Approve USDC for the curve
      const approveHash = await writeRetry(walletClient, {
        address: USDC,
        abi: erc20Abi,
        functionName: 'approve',
        args: [curveAddress, buyChunk],
      }, `approveBuy${buyCount}`);
      await waitForReceipt(publicClient, approveHash, `approveBuy${buyCount}`);

      // Buy
      const buyHash = await writeRetry(walletClient, {
        address: curveAddress,
        abi: BONDING_CURVE_ABI,
        functionName: 'buy',
        args: [buyChunk, 0n],
      }, `buy${buyCount}`);
      const buyReceipt = await waitForReceipt(publicClient, buyHash, `buy${buyCount}`);

      if (buyReceipt.status !== 'success') {
        throw new Error(`Bonding-curve buy #${buyCount} failed on-chain`);
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

  // ─── Step 4: Verify automatic migration / support legacy curves ───────
  console.log('');
  let curveGraduated = await readRetry(publicClient, {
    address: curveAddress,
    abi: BONDING_CURVE_ABI,
    functionName: 'graduated',
  }, 'curveGraduated');
  if (curveGraduated) {
    console.log('Step 4: ✓ Threshold-crossing buy migrated automatically.');
  } else {
    console.log('Step 4: Legacy curve detected; calling permissionless migration...');
    const migrateHash = await writeRetry(walletClient, {
      address: MIGRATOR,
      abi: MIGRATOR_ABI,
      functionName: 'checkAndMigrate',
      args: [tokenAddress],
    }, 'migrate');
    const migrateReceipt = await waitForReceipt(publicClient, migrateHash, 'migrate');
    if (migrateReceipt.status !== 'success') throw new Error('Migration transaction failed on-chain');
    console.log(`  ✓ Legacy migration tx confirmed: ${migrateHash}`);
    curveGraduated = await readRetry(publicClient, {
      address: curveAddress,
      abi: BONDING_CURVE_ABI,
      functionName: 'graduated',
    }, 'curveGraduatedAfterLegacyMigration');
  }

  // ─── Step 5: Verify on-chain ──────────────────────────────────────────
  console.log('');
  console.log('Step 5: Verifying graduation on-chain...');

  // 5a. Check token is marked graduated via the curve's `graduated` public var
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
  const migratorPair = await readRetry(publicClient, {
    address: MIGRATOR,
    abi: MIGRATOR_ABI,
    functionName: 'getAmmPair',
    args: [tokenAddress],
  }, 'migratorPair');
  if (migratorPair.toLowerCase() !== ammPair.toLowerCase()) {
    throw new Error('Migrator pair record does not match AMM factory pair');
  }

  const factoryToken = await readRetry(publicClient, {
    address: TOKEN_FACTORY,
    abi: TOKEN_FACTORY_ABI,
    functionName: 'getToken',
    args: [tokenAddress],
  }, 'factoryToken');
  if (!factoryToken.graduated) throw new Error('Factory did not mark token graduated');
  const [tokenGraduated, tokenOwner, tokenBondingCurve] = await Promise.all([
    readRetry(publicClient, { address: tokenAddress, abi: MEME_TOKEN_ABI, functionName: 'graduated' }, 'tokenGraduated'),
    readRetry(publicClient, { address: tokenAddress, abi: MEME_TOKEN_ABI, functionName: 'owner' }, 'tokenOwner'),
    readRetry(publicClient, { address: tokenAddress, abi: MEME_TOKEN_ABI, functionName: 'bondingCurve' }, 'tokenBondingCurve'),
  ]);
  if (!tokenGraduated) throw new Error('MemeToken did not mark itself graduated');
  if (tokenOwner !== '0x0000000000000000000000000000000000000000') {
    throw new Error('MemeToken ownership was not renounced on graduation');
  }
  if (tokenBondingCurve !== '0x0000000000000000000000000000000000000000') {
    throw new Error('MemeToken bonding curve was not cleared on graduation');
  }

  // 5b. Check AMM pair reserves
  const [reserve0, reserve1] = await readRetry(publicClient, {
    address: ammPair,
    abi: AMM_PAIR_ABI,
    functionName: 'getReserves',
  }, 'getReserves');
  const [pairToken0, pairToken1] = await Promise.all([
    readRetry(publicClient, { address: ammPair, abi: AMM_PAIR_ABI, functionName: 'token0' }, 'pairToken0'),
    readRetry(publicClient, { address: ammPair, abi: AMM_PAIR_ABI, functionName: 'token1' }, 'pairToken1'),
  ]);
  const usdcIsToken0 = pairToken0.toLowerCase() === USDC.toLowerCase();
  if (!usdcIsToken0 && pairToken1.toLowerCase() !== USDC.toLowerCase()) {
    throw new Error('AMM pair does not contain Arc USDC');
  }
  const usdcReserve = usdcIsToken0 ? reserve0 : reserve1;
  const tokenReserve = usdcIsToken0 ? reserve1 : reserve0;
  console.log(`  AMM reserves: ${formatUnits(tokenReserve, 18)} tokens / ${formatUnits(usdcReserve, 6)} USDC`);
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
  // AMMPair permanently locks its 1,000-wei MINIMUM_LIQUIDITY at address(0).
  // Every redeemable LP token minted to the migrator must be at 0x...dEaD.
  if (burnedLp + MINIMUM_LIQUIDITY !== lpTotalSupply) {
    throw new Error('Migration did not burn all redeemable LP supply');
  }
  const burnPct = Number(burnedLp * 10000n / lpTotalSupply) / 100;
  console.log(`  Burn percentage: ${burnPct.toFixed(2)}%`);

  // ─── Step 6: Execute an AMM router buy and sell ──────────────────────
  console.log('');
  console.log('Step 6: Executing AMM router buy and sell...');
  const routerBuyAmount = parseUnits('1', 6);
  const tokenBalanceBefore = await readRetry(publicClient, {
    address: tokenAddress,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [account.address],
  }, 'tokenBalanceBeforeRouterBuy');
  const approveRouterUsdcHash = await writeRetry(walletClient, {
    address: USDC,
    abi: erc20Abi,
    functionName: 'approve',
    args: [AMM_ROUTER, routerBuyAmount],
  }, 'approveRouterUsdc');
  await waitForReceipt(publicClient, approveRouterUsdcHash, 'approveRouterUsdc');
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 600);
  const routerBuyHash = await writeRetry(walletClient, {
    address: AMM_ROUTER,
    abi: AMM_ROUTER_ABI,
    functionName: 'swapExactUSDCForTokens',
    args: [routerBuyAmount, 1n, deadline, ammPair, account.address],
  }, 'routerBuy');
  const routerBuyReceipt = await waitForReceipt(publicClient, routerBuyHash, 'routerBuy');
  if (routerBuyReceipt.status !== 'success') throw new Error('AMM router buy failed on-chain');
  const tokenBalanceAfter = await readRetry(publicClient, {
    address: tokenAddress,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [account.address],
  }, 'tokenBalanceAfterRouterBuy');
  const routerTokensOut = tokenBalanceAfter - tokenBalanceBefore;
  if (routerTokensOut <= 0n) throw new Error('AMM router buy returned no tokens');
  console.log(`  ✓ Router buy: ${routerBuyHash} (${formatUnits(routerTokensOut, 18)} tokens)`);

  const approveRouterTokenHash = await writeRetry(walletClient, {
    address: tokenAddress,
    abi: erc20Abi,
    functionName: 'approve',
    args: [AMM_ROUTER, routerTokensOut],
  }, 'approveRouterToken');
  await waitForReceipt(publicClient, approveRouterTokenHash, 'approveRouterToken');
  const usdcBalanceBeforeSell = await readRetry(publicClient, {
    address: USDC,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [account.address],
  }, 'usdcBalanceBeforeRouterSell');
  const routerSellHash = await writeRetry(walletClient, {
    address: AMM_ROUTER,
    abi: AMM_ROUTER_ABI,
    functionName: 'swapExactTokensForUSDC',
    args: [routerTokensOut, 1n, deadline, ammPair, account.address],
  }, 'routerSell');
  const routerSellReceipt = await waitForReceipt(publicClient, routerSellHash, 'routerSell');
  if (routerSellReceipt.status !== 'success') throw new Error('AMM router sell failed on-chain');
  const usdcBalanceAfterSell = await readRetry(publicClient, {
    address: USDC,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [account.address],
  }, 'usdcBalanceAfterRouterSell');
  if (usdcBalanceAfterSell <= usdcBalanceBeforeSell) throw new Error('AMM router sell returned no USDC');
  console.log(`  ✓ Router sell: ${routerSellHash} (${formatUnits(usdcBalanceAfterSell - usdcBalanceBeforeSell, 6)} USDC)`);

  // ─── Step 7: Verify indexed graduation, swaps, candles, and volume ───
  console.log('');
  console.log('Step 7: Waiting for API lifecycle data...');
  let apiToken = null;
  let apiEvidence = null;
  for (let i = 0; i < 36; i++) {
    try {
      const [tokenRes, activityRes, candlesRes, statsRes] = await Promise.all([
        fetchApi(`/tokens/${tokenAddress.toLowerCase()}`),
        fetchApi('/tokens/activity/recent?limit=50'),
        fetchApi(`/tokens/${tokenAddress.toLowerCase()}/candles?timeframe=10s&mode=price&limit=100`),
        fetchApi('/tokens/stats'),
      ]);
      if (tokenRes.ok && activityRes.ok && candlesRes.ok && statsRes.ok) {
        apiToken = await tokenRes.json();
        const activityBody = await activityRes.json();
        const candles = await candlesRes.json();
        const stats = await statsRes.json();
        const activity = activityBody.activity || [];
        const indexedHashes = new Set(activity.map((item) => item.tx_hash?.toLowerCase()));
        const buyIndexed = indexedHashes.has(routerBuyHash.toLowerCase());
        const sellIndexed = indexedHashes.has(routerSellHash.toLowerCase());
        const candlesReady = Array.isArray(candles) && candles.length > 0
          && candles.some((candle) => Number(candle.volume) > 0);
        const tokenVolumeReady = Number(apiToken.volume_24h) > 0;
        const globalVolumeReady = Number(stats.volume_24h) > 0;
        const graduationReady = apiToken.status === 'graduated'
          && apiToken.amm_pair_address?.toLowerCase() === ammPair.toLowerCase()
          && BigInt(apiToken.lp_burned || '0') === burnedLp;
        if (graduationReady && buyIndexed && sellIndexed && candlesReady && tokenVolumeReady && globalVolumeReady) {
          apiEvidence = { candles: candles.length, tokenVolume: apiToken.volume_24h, globalVolume: stats.volume_24h };
          console.log(`  ✓ Full API lifecycle indexed after ${(i + 1) * 5}s`);
          break;
        }
        console.log(`  [${i + 1}] graduation=${graduationReady} ammBuy=${buyIndexed} ammSell=${sellIndexed} candles=${candlesReady} tokenVolume=${tokenVolumeReady} globalVolume=${globalVolumeReady}`);
      }
    } catch (e) {
      console.log(`  [${i + 1}] API error: ${e.message}`);
    }
    await sleep(5000);
  }

  if (!apiEvidence) throw new Error('API did not index the full lifecycle within 180s');

  const endingBalance = await readRetry(publicClient, {
    address: USDC,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [account.address],
  }, 'endingBalance');

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
  console.log(`  Router buy: ${routerBuyHash}`);
  console.log(`  Router sell:${routerSellHash}`);
  console.log(`  Reserves:   ${formatUnits(tokenReserve, 18)} tokens / ${formatUnits(usdcReserve, 6)} USDC`);
  console.log(`  API candles:${apiEvidence.candles}, token volume: $${apiEvidence.tokenVolume}, global volume: $${apiEvidence.globalVolume}`);
  console.log(`  End balance:${formatUnits(endingBalance, 6)} USDC (spent ${formatUnits(startingBalance - endingBalance, 6)} USDC)`);
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
