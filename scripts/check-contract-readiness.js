/** Read-only check that configured testnet contracts exist and report ownership. */
require('dotenv').config();
const { createPublicClient, fallback, http } = require('viem');
const { arcTestnet } = require('viem/chains');

const urls = (process.env.ARC_RPC_URLS || 'https://rpc.testnet.arc.network')
  .split(',').map((url) => url.trim()).filter(Boolean);
const client = createPublicClient({ chain: arcTestnet, transport: fallback(urls.map((url) => http(url)), { rank: false }) });
const ownerAbi = [{ type: 'function', name: 'owner', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] }];
const configured = Object.entries(process.env)
  .filter(([name, value]) => /^ARC_.*_ADDRESS$/.test(name) && /^0x[0-9a-fA-F]{40}$/.test(value || ''));

async function main() {
  const chainId = await client.getChainId();
  const checks = [];
  for (const [name, address] of configured) {
    const bytecode = await client.getBytecode({ address });
    let owner = null;
    try {
      owner = await client.readContract({ address, abi: ownerAbi, functionName: 'owner' });
    } catch {
      // Not every configured contract is Ownable.
    }
    checks.push({ name, address, deployed: !!bytecode && bytecode !== '0x', owner });
  }
  console.log(JSON.stringify({ chainId, checks }, null, 2));
  if (chainId !== 5042002 || checks.some((check) => !check.deployed)) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
