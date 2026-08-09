#!/usr/bin/env node
'use strict';

const {
  createPublicClient,
  createWalletClient,
  decodeEventLog,
  fallback,
  formatUnits,
  http,
  parseUnits,
} = require('viem');
const { privateKeyToAccount } = require('viem/accounts');
const { arcTestnet } = require('viem/chains');

const USDC = '0x3600000000000000000000000000000000000000';
const factory = process.env.ARC_TOKEN_FACTORY_ADDRESS;
const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
if (!factory || !privateKey) throw new Error('ARC_TOKEN_FACTORY_ADDRESS and DEPLOYER_PRIVATE_KEY are required');

const urls = (process.env.ARC_RPC_URLS ||
  'https://rpc.testnet.arc.network,https://rpc.drpc.testnet.arc.network,https://rpc.quicknode.testnet.arc.network,https://rpc.blockdaemon.testnet.arc.network')
  .split(',').map((url) => url.trim()).filter(Boolean);
const transport = fallback(urls.map((url) => http(url, { timeout: 8_000 })), { rank: false });
const account = privateKeyToAccount(privateKey);
const publicClient = createPublicClient({ chain: arcTestnet, transport });
const walletClient = createWalletClient({ chain: arcTestnet, transport, account });

const factoryAbi = [
  { type: 'function', name: 'creationFee', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'createToken', stateMutability: 'nonpayable', inputs: [
    { name: 'name', type: 'string' }, { name: 'symbol', type: 'string' },
    { name: 'imageURI', type: 'string' }, { name: 'description', type: 'string' },
  ], outputs: [{ type: 'address' }, { type: 'address' }] },
  { type: 'event', name: 'TokenCreated', anonymous: false, inputs: [
    { indexed: true, name: 'token', type: 'address' },
    { indexed: true, name: 'curve', type: 'address' },
    { indexed: true, name: 'creator', type: 'address' },
    { indexed: false, name: 'name', type: 'string' },
    { indexed: false, name: 'symbol', type: 'string' },
    { indexed: false, name: 'image', type: 'string' },
    { indexed: false, name: 'createdAt', type: 'uint256' },
  ] },
];

const erc20Abi = [
  { type: 'function', name: 'approve', stateMutability: 'nonpayable', inputs: [{ type: 'address' }, { type: 'uint256' }], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'allowance', stateMutability: 'view', inputs: [{ type: 'address' }, { type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'owner', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'bondingCurve', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
];

const curveAbi = [
  { type: 'function', name: 'quoteBuy', stateMutability: 'view', inputs: [{ type: 'uint256' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'quoteSell', stateMutability: 'view', inputs: [{ type: 'uint256' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'buy', stateMutability: 'nonpayable', inputs: [{ type: 'uint256' }, { type: 'uint256' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'sell', stateMutability: 'nonpayable', inputs: [{ type: 'uint256' }, { type: 'uint256' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'realUsdc', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'tokensSold', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'marketCap', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
];

async function write(address, abi, functionName, args) {
  const hash = await walletClient.writeContract({ address, abi, functionName, args, account });
  const receipt = await publicClient.waitForTransactionReceipt({ hash, confirmations: 1, timeout: 90_000 });
  if (receipt.status !== 'success') throw new Error(`${functionName} reverted: ${hash}`);
  return { hash, receipt };
}

async function main() {
  const chainId = await publicClient.getChainId();
  if (chainId !== arcTestnet.id) throw new Error(`Wrong chain: ${chainId}`);
  const name = `Readiness ${Date.now().toString().slice(-7)}`;
  const symbol = `RDY${Date.now().toString().slice(-4)}`;
  const creationFee = await publicClient.readContract({ address: factory, abi: factoryAbi, functionName: 'creationFee' });

  const feeApproval = await write(USDC, erc20Abi, 'approve', [factory, creationFee]);
  const launch = await write(factory, factoryAbi, 'createToken', [name, symbol, 'ipfs://orba/readiness', 'Parallel stack readiness test']);
  const createdLog = launch.receipt.logs.find((log) => log.address.toLowerCase() === factory.toLowerCase());
  if (!createdLog) throw new Error('TokenCreated event missing');
  const decoded = decodeEventLog({ abi: factoryAbi, data: createdLog.data, topics: createdLog.topics });
  const token = decoded.args.token;
  const curve = decoded.args.curve;

  const [tokenOwner, bondingCurve] = await Promise.all([
    publicClient.readContract({ address: token, abi: erc20Abi, functionName: 'owner' }),
    publicClient.readContract({ address: token, abi: erc20Abi, functionName: 'bondingCurve' }),
  ]);
  if (tokenOwner.toLowerCase() !== curve.toLowerCase() || bondingCurve.toLowerCase() !== curve.toLowerCase()) {
    throw new Error('Token/curve ownership wiring mismatch');
  }

  const buyAmount = parseUnits('2', 6);
  const quoteBuy = await publicClient.readContract({ address: curve, abi: curveAbi, functionName: 'quoteBuy', args: [buyAmount] });
  const buyApproval = await write(USDC, erc20Abi, 'approve', [curve, buyAmount]);
  const buy = await write(curve, curveAbi, 'buy', [buyAmount, quoteBuy * 95n / 100n]);
  const tokenBalance = await publicClient.readContract({ address: token, abi: erc20Abi, functionName: 'balanceOf', args: [account.address] });
  if (tokenBalance === 0n) throw new Error('Buy produced no tokens');

  const sellAmount = tokenBalance / 2n;
  const quoteSell = await publicClient.readContract({ address: curve, abi: curveAbi, functionName: 'quoteSell', args: [sellAmount] });
  const sellApproval = await write(token, erc20Abi, 'approve', [curve, sellAmount]);
  const sell = await write(curve, curveAbi, 'sell', [sellAmount, quoteSell * 95n / 100n]);

  const [realUsdc, tokensSold, marketCap, factoryAllowance, curveAllowance, tokenAllowance] = await Promise.all([
    publicClient.readContract({ address: curve, abi: curveAbi, functionName: 'realUsdc' }),
    publicClient.readContract({ address: curve, abi: curveAbi, functionName: 'tokensSold' }),
    publicClient.readContract({ address: curve, abi: curveAbi, functionName: 'marketCap' }),
    publicClient.readContract({ address: USDC, abi: erc20Abi, functionName: 'allowance', args: [account.address, factory] }),
    publicClient.readContract({ address: USDC, abi: erc20Abi, functionName: 'allowance', args: [account.address, curve] }),
    publicClient.readContract({ address: token, abi: erc20Abi, functionName: 'allowance', args: [account.address, curve] }),
  ]);
  if (factoryAllowance !== 0n || curveAllowance !== 0n || tokenAllowance !== 0n) {
    throw new Error('Exact approvals were not fully consumed');
  }

  console.log(JSON.stringify({
    status: 'PASS', chainId, factory, token, curve,
    creationFee: formatUnits(creationFee, 6), realUsdc: formatUnits(realUsdc, 6),
    tokensSold: formatUnits(tokensSold, 18), marketCap: formatUnits(marketCap, 6),
    transactions: {
      feeApproval: feeApproval.hash, launch: launch.hash, buyApproval: buyApproval.hash,
      buy: buy.hash, sellApproval: sellApproval.hash, sell: sell.hash,
    },
  }, null, 2));
}

main().catch((error) => {
  console.error(error.shortMessage || error.message);
  process.exit(1);
});
