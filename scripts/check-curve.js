const f = require('node-fetch');
const { createPublicClient, http, parseAbiItem, formatUnits, parseUnits } = require('viem');
const { arcTestnet } = require('viem/chains');

const CURVE = '0x486ea7b6de154811fe1417b5ccd011d6b54bf258';
const TOKEN = '0xbb0a4483e90333f097ba68052afdd1f4e475bfe0';
const USDC = '0x3600000000000000000000000000000000000000';

const client = createPublicClient({
  chain: arcTestnet,
  transport: http('https://rpc.testnet.arc.io'),
});

async function main() {
  // 1. Quote buy for 10 USDC
  console.log('=== Quote Buy 10 USDC ===');
  try {
    const quote = await client.readContract({
      address: CURVE,
      abi: [parseAbiItem('function quoteBuy(uint256 usdcAmount) view returns (uint256 tokensOut)')],
      functionName: 'quoteBuy',
      args: [parseUnits('10', 6)],
    });
    console.log('Tokens out:', formatUnits(quote, 18));
  } catch (e) {
    console.log('QuoteBuy ERROR:', e.message);
  }

  // 2. Check curve status (isPaused, isGraduated)
  console.log('\n=== Curve Status ===');
  try {
    const paused = await client.readContract({
      address: CURVE,
      abi: [parseAbiItem('function isPaused() view returns (bool)')],
      functionName: 'isPaused',
    });
    console.log('isPaused:', paused);
  } catch (e) {
    console.log('isPaused ERROR:', e.message);
  }

  try {
    const graduated = await client.readContract({
      address: CURVE,
      abi: [parseAbiItem('function isGraduated() view returns (bool)')],
      functionName: 'isGraduated',
    });
    console.log('isGraduated:', graduated);
  } catch (e) {
    console.log('isGraduated ERROR:', e.message);
  }

  // 3. Check tokensSold
  try {
    const sold = await client.readContract({
      address: CURVE,
      abi: [parseAbiItem('function tokensSold() view returns (uint256)')],
      functionName: 'tokensSold',
    });
    console.log('tokensSold:', formatUnits(sold, 18));
  } catch (e) {
    console.log('tokensSold ERROR:', e.message);
  }

  // 4. Check token balance of curve (should have the tokens to sell)
  try {
    const bal = await client.readContract({
      address: TOKEN,
      abi: [parseAbiItem('function balanceOf(address) view returns (uint256)')],
      functionName: 'balanceOf',
      args: [CURVE],
    });
    console.log('Curve token balance:', formatUnits(bal, 18));
  } catch (e) {
    console.log('balanceOf ERROR:', e.message);
  }
}

main().catch(console.error);
