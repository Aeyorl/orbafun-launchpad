/**
 * Budget graduation test — uses TestTokenFactory + TestBondingCurve (low $4,150
 * graduation threshold instead of production $25,000) so we can test the full
 * graduation flow for ~$120 instead of ~$9,000.
 *
 * Flow:
 *   1. Deploy TestTokenFactory + LiquidityMigration (pointing to test factory)
 *   2. Set test factory's migrator
 *   3. Approve USDC + launch a token via test factory
 *   4. Buy ~$120 of tokens (pushes MC from $4,000 to $4,150+)
 *   5. Call LiquidityMigration.checkAndMigrate(tokenAddress)
 *   6. Verify anti-rug mechanics:
 *      - AMM pair created with liquidity (reserves > 0)
 *      - LP tokens burned to 0x...dEaD
 *      - Token ownership renounced (owner is address(0))
 *      - Token marked as graduated (graduated == true)
 *      - Curve marked as graduated (graduated == true)
 *      - Factory marks token as graduated
 *
 * Usage:
 *   node scripts/load-test-graduation.js
 *
 * Requires: DEPLOYER_PRIVATE_KEY, API on :4000, ~$130 USDC in deployer wallet.
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
const AMM_FACTORY = process.env.ARC_AMM_FACTORY_ADDRESS;
const BURN_ADDRESS = '0x000000000000000000000000000000000000dEaD';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ABIs
const TEST_TOKEN_FACTORY_ABI = [
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
    name: 'setMigrator',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'newMigrator', type: 'address' }],
    outputs: [],
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

const MIGRATOR_ABI = [
  {
    name: 'checkAndMigrate',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'tokenAddress', type: 'address' }],
    outputs: [],
  },
  {
    name: 'tokenToAmmPair',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: '', type: 'address' }],
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
    name: 'quoteBuy',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'usdcAmount', type: 'uint256' }],
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
    name: 'GRADUATION_MARKET_CAP',
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
  {
    name: 'token',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
];

const MEME_TOKEN_ABI = [
  {
    name: 'graduated',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'owner',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    name: 'bondingCurve',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
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

// Bytecodes for deployment (extracted from forge build)
const TEST_TOKEN_FACTORY_BYTECODE = ''; // will be loaded from artifacts
const MIGRATOR_BYTECODE = ''; // will be loaded from artifacts

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

async function waitForReceipt(publicClient, hash, label = 'tx', timeoutMs = 120000) {
  const start = Date.now();
  for (let attempt = 0; attempt < 60; attempt++) {
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
        await sleep(3000);
        continue;
      }
      throw e;
    }
    await sleep(3000);
  }
  throw new Error(`${label}: receipt not found after 60 attempts`);
}

async function deployContract(walletClient, publicClient, bytecode, abi, args, label) {
  console.log(`  Deploying ${label}...`);
  const hash = await walletClient.deployContract({ abi, bytecode, args });
  console.log(`  [${label}] deploy tx: ${hash}`);
  const receipt = await waitForReceipt(publicClient, hash, label);
  if (receipt.status !== 'success') throw new Error(`${label} deploy failed`);
  const address = receipt.contractAddress;
  console.log(`  [${label}] deployed at ${address} (block ${receipt.blockNumber})`);
  return address;
}

async function main() {
  if (!DEPLOYER_PK) {
    console.error('DEPLOYER_PRIVATE_KEY not set');
    process.exit(1);
  }
  if (!AMM_FACTORY) {
    console.error('ARC_AMM_FACTORY_ADDRESS not set');
    process.exit(1);
  }

  const account = privateKeyToAccount(DEPLOYER_PK);
  const transport = fallback(RPC_URLS.map((url) => http(url, { pollingInterval: 4_000 })), { rank: false });
  const publicClient = createPublicClient({ chain: arcTestnet, transport });
  const walletClient = createWalletClient({ chain: arcTestnet, transport, account });

  console.log('========================================');
  console.log('  Budget Graduation Test');
  console.log('  (TestTokenFactory + TestBondingCurve)');
  console.log('  Low $4,150 threshold — ~$120 cost');
  console.log('========================================');
  console.log(`Wallet: ${account.address}`);
  console.log('');

  // Check balance
  const usdcBalance = await readRetry(
    publicClient,
    { address: USDC, abi: erc20Abi, functionName: 'balanceOf', args: [account.address] },
    'balance',
  );
  console.log(`USDC balance: ${formatUnits(usdcBalance, 6)} USDC`);
  if (usdcBalance < parseUnits('130', 6)) {
    console.error(`Need at least 130 USDC, have ${formatUnits(usdcBalance, 6)}`);
    process.exit(1);
  }
  console.log('');

  // ─── Step 1: Deploy TestTokenFactory ───────────────────────────────────
  console.log('--- Step 1: Deploy TestTokenFactory ---');
  const fs = require('fs');
  const path = require('path');

  const factoryArtifact = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'contracts', 'out', 'TestTokenFactory.sol', 'TestTokenFactory.json'), 'utf8'),
  );
  const migratorArtifact = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'contracts', 'out', 'LiquidityMigration.sol', 'LiquidityMigration.json'), 'utf8'),
  );

  const testFactoryAddress = await deployContract(
    walletClient,
    publicClient,
    factoryArtifact.bytecode.object,
    factoryArtifact.abi,
    [account.address], // treasury = deployer
    'TestTokenFactory',
  );

  // ─── Step 2: Deploy LiquidityMigration pointing to test factory ────────
  console.log('\n--- Step 2: Deploy LiquidityMigration ---');
  const migratorAddress = await deployContract(
    walletClient,
    publicClient,
    migratorArtifact.bytecode.object,
    migratorArtifact.abi,
    [testFactoryAddress, AMM_FACTORY],
    'LiquidityMigration',
  );

  // ─── Step 3: Set migrator on test factory ──────────────────────────────
  console.log('\n--- Step 3: Set migrator on test factory ---');
  const setMigHash = await writeRetry(
    walletClient,
    { address: testFactoryAddress, abi: TEST_TOKEN_FACTORY_ABI, functionName: 'setMigrator', args: [migratorAddress] },
    'setMigrator',
  );
  await waitForReceipt(publicClient, setMigHash, 'setMigrator');
  console.log(`  Migrator set to ${migratorAddress}`);

  // ─── Step 4: Launch a token via test factory ───────────────────────────
  console.log('\n--- Step 4: Launch token ---');
  const creationFee = await readRetry(
    publicClient,
    { address: testFactoryAddress, abi: TEST_TOKEN_FACTORY_ABI, functionName: 'creationFee' },
    'creationFee',
  );
  console.log(`  Creation fee: ${formatUnits(creationFee, 6)} USDC`);

  // Approve USDC for factory
  const approveHash = await writeRetry(
    walletClient,
    { address: USDC, abi: erc20Abi, functionName: 'approve', args: [testFactoryAddress, creationFee] },
    'approveFee',
  );
  await waitForReceipt(publicClient, approveHash, 'approveFee');

  const suffix = Math.floor(Math.random() * 100000).toString();
  const name = `LoadTest${suffix}`;
  const symbol = `LT${suffix.slice(0, 4)}`;
  console.log(`  Creating token: ${name} (${symbol})...`);

  const createHash = await writeRetry(
    walletClient,
    { address: testFactoryAddress, abi: TEST_TOKEN_FACTORY_ABI, functionName: 'createToken', args: [name, symbol, `ipfs://test/${suffix}`, 'Load test graduation token'] },
    'createToken',
  );
  const createReceipt = await waitForReceipt(publicClient, createHash, 'createToken');
  console.log(`  Token created in block ${createReceipt.blockNumber}`);

  // Parse TokenCreated event to get addresses
  // event TokenCreated(address indexed token, address indexed curve, address indexed creator, ...)
  const tokenCreatedLog = createReceipt.logs.find((l) => l.address.toLowerCase() === testFactoryAddress.toLowerCase());
  if (!tokenCreatedLog) throw new Error('TokenCreated event not found');
  const tokenAddress = '0x' + tokenCreatedLog.topics[1].slice(26);
  const curveAddress = '0x' + tokenCreatedLog.topics[2].slice(26);
  console.log(`  Token:  ${tokenAddress}`);
  console.log(`  Curve:  ${curveAddress}`);

  // Verify graduation threshold
  const gradThreshold = await readRetry(
    publicClient,
    { address: curveAddress, abi: BONDING_CURVE_ABI, functionName: 'GRADUATION_MARKET_CAP' },
    'gradThreshold',
  );
  console.log(`  Graduation threshold: $${formatUnits(gradThreshold, 6)} (should be $4,150)`);

  const mcBefore = await readRetry(
    publicClient,
    { address: curveAddress, abi: BONDING_CURVE_ABI, functionName: 'marketCap' },
    'mcBefore',
  );
  console.log(`  Market cap before buys: $${formatUnits(mcBefore, 6)}`);

  // ─── Step 5: Buy tokens to reach graduation threshold ──────────────────
  console.log('\n--- Step 5: Buy tokens to reach graduation threshold ---');
  // We need ~$110 of buys to push MC from $4,000 to $4,150
  // Buy $120 to have margin
  const BUY_USDC = parseUnits('120', 6);

  // Quote
  const quote = await readRetry(
    publicClient,
    { address: curveAddress, abi: BONDING_CURVE_ABI, functionName: 'quoteBuy', args: [BUY_USDC] },
    'quoteBuy',
  );
  console.log(`  Quote: ${formatUnits(quote, 18)} tokens for 120 USDC`);
  console.log(`  Max wallet: 40M tokens — quote is ${formatUnits(quote, 18)} tokens`);

  // Approve USDC for curve
  const approveBuyHash = await writeRetry(
    walletClient,
    { address: USDC, abi: erc20Abi, functionName: 'approve', args: [curveAddress, BUY_USDC] },
    'approveBuy',
  );
  await waitForReceipt(publicClient, approveBuyHash, 'approveBuy');

  // Buy
  const minOut = (quote * 90n) / 100n; // 10% slippage (generous for safety)
  console.log(`  Buying 120 USDC worth (min ${formatUnits(minOut, 18)} tokens)...`);
  const buyHash = await writeRetry(
    walletClient,
    { address: curveAddress, abi: BONDING_CURVE_ABI, functionName: 'buy', args: [BUY_USDC, minOut] },
    'buy',
  );
  const buyReceipt = await waitForReceipt(publicClient, buyHash, 'buy');
  console.log(`  Buy confirmed in block ${buyReceipt.blockNumber} (status ${buyReceipt.status})`);

  const mcAfter = await readRetry(
    publicClient,
    { address: curveAddress, abi: BONDING_CURVE_ABI, functionName: 'marketCap' },
    'mcAfter',
  );
  console.log(`  Market cap after buy: $${formatUnits(mcAfter, 6)}`);

  if (mcAfter < gradThreshold) {
    console.log(`  ⚠ MC $${formatUnits(mcAfter, 6)} < threshold $${formatUnits(gradThreshold, 6)} — need more buys`);
    // Buy more in $20 chunks
    for (let i = 0; i < 5 && mcAfter < gradThreshold; i++) {
      const extraBuy = parseUnits('20', 6);
      const extraApprove = await writeRetry(
        walletClient,
        { address: USDC, abi: erc20Abi, functionName: 'approve', args: [curveAddress, extraBuy] },
        `approveExtra-${i}`,
      );
      await waitForReceipt(publicClient, extraApprove, `approveExtra-${i}`);
      const extraBuyHash = await writeRetry(
        walletClient,
        { address: curveAddress, abi: BONDING_CURVE_ABI, functionName: 'buy', args: [extraBuy, 0n] },
        `buyExtra-${i}`,
      );
      await waitForReceipt(publicClient, extraBuyHash, `buyExtra-${i}`);
      const mcNow = await readRetry(publicClient, { address: curveAddress, abi: BONDING_CURVE_ABI, functionName: 'marketCap' }, `mcExtra-${i}`);
      console.log(`  After extra buy #${i + 1}: MC $${formatUnits(mcNow, 6)}`);
      mcAfter = mcNow;
    }
  }

  if (mcAfter >= gradThreshold) {
    console.log(`  ✓ MC $${formatUnits(mcAfter, 6)} >= threshold $${formatUnits(gradThreshold, 6)}`);
  } else {
    console.error(`  ✗ Could not reach graduation threshold`);
    process.exit(1);
  }

  // ─── Step 6: Graduate (call LiquidityMigration.checkAndMigrate) ────────
  console.log('\n--- Step 6: Graduate token ---');
  console.log(`  Calling checkAndMigrate(${tokenAddress})...`);
  const migrateHash = await writeRetry(
    walletClient,
    { address: migratorAddress, abi: MIGRATOR_ABI, functionName: 'checkAndMigrate', args: [tokenAddress] },
    'migrate',
  );
  const migrateReceipt = await waitForReceipt(publicClient, migrateHash, 'migrate');
  console.log(`  Migration confirmed in block ${migrateReceipt.blockNumber} (status ${migrateReceipt.status})`);
  if (migrateReceipt.status !== 'success') {
    console.error('  ✗ Migration transaction reverted!');
    process.exit(1);
  }

  // ─── Step 7: Verify anti-rug mechanics ─────────────────────────────────
  console.log('\n--- Step 7: Verify anti-rug mechanics ---');
  let allPass = true;

  // 7a. AMM pair created with liquidity
  console.log('\n  [1] AMM pair created with liquidity');
  const ammPair = await readRetry(
    publicClient,
    { address: migratorAddress, abi: MIGRATOR_ABI, functionName: 'tokenToAmmPair', args: [tokenAddress] },
    'ammPair',
  );
  if (ammPair === '0x0000000000000000000000000000000000000000') {
    console.log('    ✗ FAIL: No AMM pair recorded');
    allPass = false;
  } else {
    console.log(`    AMM pair: ${ammPair}`);
    const [reserve0, reserve1] = await readRetry(
      publicClient,
      { address: ammPair, abi: AMM_PAIR_ABI, functionName: 'getReserves' },
      'reserves',
    );
    console.log(`    Reserve0: ${reserve0}`);
    console.log(`    Reserve1: ${reserve1}`);
    if (reserve0 > 0 && reserve1 > 0) {
      console.log('    ✓ PASS: AMM pair has liquidity');
    } else {
      console.log('    ✗ FAIL: AMM pair has no liquidity');
      allPass = false;
    }
  }

  // 7b. LP tokens burned to 0x...dEaD
  console.log('\n  [2] LP tokens burned to 0x...dEaD');
  if (ammPair !== '0x0000000000000000000000000000000000000000') {
    const burnedLp = await readRetry(
      publicClient,
      { address: ammPair, abi: AMM_PAIR_ABI, functionName: 'balanceOf', args: [BURN_ADDRESS] },
      'burnedLp',
    );
    const lpTotalSupply = await readRetry(
      publicClient,
      { address: ammPair, abi: AMM_PAIR_ABI, functionName: 'totalSupply' },
      'lpTotalSupply',
    );
    const burnPct = (Number(burnedLp) / Number(lpTotalSupply)) * 100;
    console.log(`    LP burned: ${formatUnits(burnedLp, 18)} / ${formatUnits(lpTotalSupply, 18)} (${burnPct.toFixed(2)}%)`);
    if (burnPct >= 99) {
      console.log('    ✓ PASS: >=99% of LP tokens burned');
    } else {
      console.log(`    ✗ FAIL: Only ${burnPct.toFixed(2)}% burned (expected >=99%)`);
      allPass = false;
    }
  }

  // 7c. Token ownership renounced
  console.log('\n  [3] Token ownership renounced');
  const tokenOwner = await readRetry(
    publicClient,
    { address: tokenAddress, abi: MEME_TOKEN_ABI, functionName: 'owner' },
    'tokenOwner',
  );
  console.log(`    Token owner: ${tokenOwner}`);
  if (tokenOwner === '0x0000000000000000000000000000000000000000') {
    console.log('    ✓ PASS: Ownership renounced (owner is zero address)');
  } else {
    console.log(`    ✗ FAIL: Owner is ${tokenOwner} (expected zero address)`);
    allPass = false;
  }

  // 7d. Token marked as graduated
  console.log('\n  [4] Token marked as graduated');
  const tokenGraduated = await readRetry(
    publicClient,
    { address: tokenAddress, abi: MEME_TOKEN_ABI, functionName: 'graduated' },
    'tokenGraduated',
  );
  console.log(`    Token graduated: ${tokenGraduated}`);
  if (tokenGraduated === true) {
    console.log('    ✓ PASS: Token is marked as graduated');
  } else {
    console.log('    ✗ FAIL: Token is not marked as graduated');
    allPass = false;
  }

  // 7e. Token bondingCurve zeroed out
  console.log('\n  [5] Token bondingCurve zeroed (graduation disables curve limits)');
  const tokenBondingCurve = await readRetry(
    publicClient,
    { address: tokenAddress, abi: MEME_TOKEN_ABI, functionName: 'bondingCurve' },
    'tokenBondingCurve',
  );
  console.log(`    Token bondingCurve: ${tokenBondingCurve}`);
  if (tokenBondingCurve === '0x0000000000000000000000000000000000000000') {
    console.log('    ✓ PASS: bondingCurve zeroed (max-wallet + cooldown disabled)');
  } else {
    console.log(`    ✗ FAIL: bondingCurve is ${tokenBondingCurve} (expected zero)`);
    allPass = false;
  }

  // 7f. Curve marked as graduated
  console.log('\n  [6] Curve marked as graduated');
  const curveGraduated = await readRetry(
    publicClient,
    { address: curveAddress, abi: BONDING_CURVE_ABI, functionName: 'graduated' },
    'curveGraduated',
  );
  console.log(`    Curve graduated: ${curveGraduated}`);
  if (curveGraduated === true) {
    console.log('    ✓ PASS: Curve is marked as graduated');
  } else {
    console.log('    ✗ FAIL: Curve is not marked as graduated');
    allPass = false;
  }

  // 7g. Factory marks token as graduated
  console.log('\n  [7] Factory marks token as graduated');
  try {
    const tokenInfo = await readRetry(
      publicClient,
      { address: testFactoryAddress, abi: factoryArtifact.abi, functionName: 'getToken', args: [tokenAddress] },
      'factoryToken',
    );
    const isGraduated = tokenInfo.graduated ?? tokenInfo[7];
    console.log(`    Factory graduated flag: ${isGraduated}`);
    if (isGraduated) {
      console.log('    ✓ PASS: Factory marks token as graduated');
    } else {
      console.log('    ✗ FAIL: Factory does not mark token as graduated');
      allPass = false;
    }
  } catch (e) {
    console.log(`    ✗ FAIL: Could not verify factory graduation flag — ${e.shortMessage || e.message}`);
    allPass = false;
  }

  // ─── Summary ───────────────────────────────────────────────────────────
  console.log('\n========================================');
  console.log('  GRADUATION TEST SUMMARY');
  console.log('========================================');
  console.log(`  TestTokenFactory:  ${testFactoryAddress}`);
  console.log(`  LiquidityMigration: ${migratorAddress}`);
  console.log(`  Token:             ${tokenAddress}`);
  console.log(`  Curve:             ${curveAddress}`);
  console.log(`  AMM Pair:          ${ammPair}`);
  console.log(`  Market Cap:        $${formatUnits(mcAfter, 6)}`);
  console.log('');
  console.log(`  Anti-rug checks: ${allPass ? '✓ ALL PASS' : '✗ SOME FAILED'}`);
  console.log('========================================');

  // Save addresses for the AMM swap test
  const fs2 = require('fs');
  fs2.writeFileSync(
    path.join(__dirname, 'load-test-graduated-addresses.json'),
    JSON.stringify({ testFactoryAddress, migratorAddress, tokenAddress, curveAddress, ammPair }, null, 2),
  );
  console.log(`\nAddresses saved to scripts/load-test-graduated-addresses.json`);
  console.log(`Use these for the AMM swap contention test.`);

  process.exit(allPass ? 0 : 1);
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
