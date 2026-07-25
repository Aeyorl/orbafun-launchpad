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

  // Check last 1000 blocks for logs from TokenFactory
  const fromBlock = '0x' + (latest - 1000).toString(16);
  const toBlock = j1.result;
  const r2 = await f('https://rpc.testnet.arc.io', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'eth_getLogs',
      params: [{ fromBlock, toBlock, address: '0x26Ab49011AAf73c373e462CbD5445588Ff69b7A6' }],
    }),
  });
  const j2 = await r2.json();
  if (j2.error) {
    console.log('Error:', JSON.stringify(j2.error));
    return;
  }
  const logs = j2.result || [];
  console.log('Found', logs.length, 'logs from TokenFactory in last 1000 blocks');
  for (const l of logs.slice(-10)) {
    console.log('  block', parseInt(l.blockNumber, 16), 'tx', l.transactionHash, 'topic', l.topics[0]?.slice(0, 10));
  }
}

main().catch((e) => console.log('ERR:', e.message));
