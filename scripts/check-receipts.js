const fetch = require('node-fetch');

async function main() {
  const curveAddress = '0x4c65f526ae815a216dd4604b859ed409503d49e4';
  const fromBlock = '0x' + (53741494).toString(16);
  const toBlock = 'latest';

  const rpcUrls = [
    'https://rpc.testnet.arc.io',
    'https://rpc.drpc.testnet.arc.io',
    'https://rpc.quicknode.testnet.arc.io',
    'https://rpc.blockdaemon.testnet.arc.io',
  ];

  for (const url of rpcUrls) {
    try {
      console.log(`Checking RPC ${url}...`);
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'eth_getLogs',
          params: [{ address: curveAddress, fromBlock, toBlock }],
        }),
      });
      const json = await res.json();
      console.log(`Result from ${url}:`, JSON.stringify(json));
    } catch (err) {
      console.error(`Error on ${url}:`, err.message);
    }
  }
}

main().catch(console.error);
