const f = require('node-fetch');

async function getReceipt(txHash) {
  const r = await f('https://rpc.testnet.arc.io', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'eth_getTransactionReceipt',
      params: [txHash],
    }),
  });
  const j = await r.json();
  if (j.error) {
    console.log('Error:', JSON.stringify(j.error));
    return null;
  }
  return j.result;
}

async function main() {
  const txs = [
    '0xd9d9c564380d3a4a15caff2227eb4ab92718f196977847750cc86062e2313f97',
    '0x72925df19316b54fd87410ea032a3a28b00a6136a4ad0fecf786ee5a4e3e15cc',
  ];
  for (const tx of txs) {
    const receipt = await getReceipt(tx);
    if (receipt) {
      console.log('TX:', tx);
      console.log('  Status:', receipt.status === '0x1' ? 'SUCCESS' : 'FAILED');
      console.log('  Block:', parseInt(receipt.blockNumber, 16));
      console.log('  Gas used:', parseInt(receipt.gasUsed, 16));
      console.log('  Logs:', receipt.logs.length);
      for (const log of receipt.logs) {
        console.log('    addr:', log.address, 'topic0:', log.topics[0]?.slice(0, 10));
      }
      console.log();
    }
  }
}

main().catch((e) => console.log('ERR:', e.message));
