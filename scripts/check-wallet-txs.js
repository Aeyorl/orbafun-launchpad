const fetch = require('node-fetch');

const RPC_URL = 'https://rpc.testnet.arc.io';
const WALLET_TOPIC = '0x00000000000000000000000074e931264f0f83f6c22d263efd8aa719d5e7f337';

async function main() {
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] }),
  });
  const json = await res.json();
  const latestBlock = BigInt(json.result);
  console.log('Latest Arc block:', latestBlock.toString());

  const fromBlock = '0x' + (latestBlock - 10000n).toString(16);
  const toBlock = json.result;

  // Search logs where topic1, topic2, or topic3 matches wallet
  console.log('Fetching logs for wallet topic in last 10,000 blocks...');

  for (const topicIdx of [1, 2, 3]) {
    const topics = [];
    topics[topicIdx] = WALLET_TOPIC;

    const logRes = await fetch(RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'eth_getLogs',
        params: [{ topics, fromBlock, toBlock }],
      }),
    });
    const logJson = await logRes.json();
    const logs = logJson.result || [];
    console.log(`Topic[${topicIdx}] logs found: ${logs.length}`);
    for (const l of logs) {
      console.log(`  Tx: ${l.transactionHash} | Address: ${l.address} | Block: ${parseInt(l.blockNumber, 16)}`);
      // Check receipt status
      const receiptRes = await fetch(RPC_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 3,
          method: 'eth_getTransactionReceipt',
          params: [l.transactionHash],
        }),
      });
      const receiptJson = await receiptRes.json();
      console.log(`    Status: ${receiptJson.result?.status}`);
    }
  }
}

main().catch(console.error);
