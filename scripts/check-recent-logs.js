const RPC_URL = process.env.ARC_RPC_URL || 'https://rpc.testnet.arc.network';
const FACTORY_ADDRESS = process.env.ARC_TOKEN_FACTORY_ADDRESS;
const CURVE_ADDRESS = process.argv[2];

if (!FACTORY_ADDRESS) {
  throw new Error('ARC_TOKEN_FACTORY_ADDRESS is required');
}

async function main() {
  const fetch = (await import('node-fetch')).default || globalThis.fetch;

  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'eth_blockNumber',
      params: [],
    }),
  });
  const json = await res.json();
  const currentBlock = BigInt(json.result);
  console.log('Current Arc block:', currentBlock.toString());

  const fromBlock = currentBlock - 2000n;
  console.log(`Checking logs from block ${fromBlock} to ${currentBlock}...`);

  // 1. Factory logs (TokenCreated)
  const factoryRes = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 2,
      method: 'eth_getLogs',
      params: [
        {
          address: FACTORY_ADDRESS,
          fromBlock: '0x' + fromBlock.toString(16),
          toBlock: '0x' + currentBlock.toString(16),
        },
      ],
    }),
  });
  const factoryJson = await factoryRes.json();
  console.log(`Factory logs found: ${factoryJson.result?.length || 0}`);
  if (factoryJson.result?.length > 0) {
    console.log('Sample factory log:', factoryJson.result[0]);
  }

  if (!CURVE_ADDRESS) return;

  // 2. Optional curve logs supplied as the first argument.
  const curveRes = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 3,
      method: 'eth_getLogs',
      params: [
        {
          address: CURVE_ADDRESS,
          fromBlock: '0x' + fromBlock.toString(16),
          toBlock: '0x' + currentBlock.toString(16),
        },
      ],
    }),
  });
  const curveJson = await curveRes.json();
  console.log(`Curve logs (${CURVE_ADDRESS}): ${curveJson.result?.length || 0}`);
  if (curveJson.result?.length > 0) {
    console.log('Sample curve logs:', curveJson.result);
  }
}

main().catch(console.error);
