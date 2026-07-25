const f = require('node-fetch');

async function main() {
  // Get latest block
  const r1 = await f('https://rpc.testnet.arc.io', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] }),
  });
  const j1 = await r1.json();
  const latest = parseInt(j1.result, 16);
  console.log('Latest block:', latest);

  // Check last 200 blocks for Buy/Sell events from bonding curves
  // Buy event topic: keccak256("Buy(address,uint256,uint256,uint256)")
  // Sell event topic: keccak256("Sell(address,uint256,uint256,uint256)")
  const fromBlock = '0x' + (latest - 200).toString(16);
  const toBlock = j1.result;

  // Get logs from the two bonding curves
  const curves = [
    '0x486ea7b6de154811fe1417b5ccd011d6b54bf258', // GHROO;D
    '0x121467e339c8a10f729fcf709a79afbf109a6f27', // $BULLY
  ];

  for (const curve of curves) {
    const r2 = await f('https://rpc.testnet.arc.io', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_getLogs',
        params: [{ fromBlock, toBlock, address: curve }],
      }),
    });
    const j2 = await r2.json();
    if (j2.error) {
      console.log(`Curve ${curve}: Error:`, JSON.stringify(j2.error));
      continue;
    }
    const logs = j2.result || [];
    console.log(`\nCurve ${curve}: ${logs.length} logs in last 200 blocks`);
    for (const l of logs) {
      const topic = l.topics[0];
      const eventName =
        topic === '0x7fcf532c15f0a6db0bd6d0e0388a325a0d15b75c7a4a48565c01c9a3b7d3a123' ? 'Buy' :
        topic === '0x5c5e3f1a8a0d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f' ? 'Sell' :
        topic?.slice(0, 10);
      console.log(`  block ${parseInt(l.blockNumber, 16)} tx ${l.transactionHash} topic ${topic?.slice(0, 10)}`);
    }
  }
}

main().catch((e) => console.log('ERR:', e.message));
