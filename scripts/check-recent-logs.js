const { createPublicClient, http, parseAbiItem } = require('viem');

const RPC_URL = 'https://rpc.testnet.arc.io';

const FACTORY_ADDRESS = '0x8b59B3c4B7A634d8599e4DFB6891CEefd5CA424b';
const TOKEN_BRO = '0x014c4e5c57db5a6ad93540f22b905c51458a743b';
const CURVE_BRO = '0x4c65538eefea10a3000b2167d4fdf80753494ee4';

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

  // 2. Curve logs for bro ($PROLS)
  const curveRes = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 3,
      method: 'eth_getLogs',
      params: [
        {
          address: CURVE_BRO,
          fromBlock: '0x' + fromBlock.toString(16),
          toBlock: '0x' + currentBlock.toString(16),
        },
      ],
    }),
  });
  const curveJson = await curveRes.json();
  console.log(`Curve logs for PROLS (${CURVE_BRO}): ${curveJson.result?.length || 0}`);
  if (curveJson.result?.length > 0) {
    console.log('Sample curve logs:', curveJson.result);
  }
}

main().catch(console.error);
