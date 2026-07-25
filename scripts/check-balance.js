#!/usr/bin/env node
/**
 * Check a wallet's USDC balance on Arc Testnet.
 *
 * Usage:
 *   node scripts/check-balance.js <wallet-address>
 *
 * Shows both the native balance (18 dec) and the ERC-20 balanceOf (6 dec).
 * Both are views of the same underlying USDC balance — they should reconcile
 * after decimal conversion (native / 1e12 ≈ erc20, within truncation).
 *
 * No dependencies — uses native https module.
 */

const https = require("https");

const RPC_URL = "https://rpc.testnet.arc.io";
const USDC_ERC20 = "0x3600000000000000000000000000000000000000";

function rpc(method, params) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ jsonrpc: "2.0", method, params, id: 1 });
    const req = https.request(
      RPC_URL,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": body.length },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(e);
          }
        });
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

// ERC-20 balanceOf(address) selector = 0x70a08231
function encodeBalanceOf(addr) {
  const clean = addr.toLowerCase().replace(/^0x/, "").padStart(64, "0");
  return "0x70a08231" + clean;
}

function hexToBigInt(hex) {
  return BigInt(hex);
}

function formatUSDC(wei18, decimals) {
  const big = BigInt(wei18);
  const divisor = 10n ** BigInt(decimals);
  const whole = big / divisor;
  const frac = big % divisor;
  const fracStr = frac.toString().padStart(decimals, "0").replace(/0+$/, "");
  return fracStr ? `${whole}.${fracStr}` : whole.toString();
}

async function main() {
  const address = process.argv[2];
  if (!address || !address.startsWith("0x") || address.length !== 42) {
    console.error("Usage: node scripts/check-balance.js <wallet-address>");
    console.error('Example: node scripts/check-balance.js 0x1234...abcd');
    process.exit(1);
  }

  console.log(`Checking balance on Arc Testnet for ${address}`);
  console.log(`RPC: ${RPC_URL}\n`);

  // Native balance (18 decimals) — eth_getBalance
  const nativeResult = await rpc("eth_getBalance", [address, "latest"]);
  if (nativeResult.error) {
    console.error("Error fetching native balance:", nativeResult.error.message);
    process.exit(1);
  }
  const nativeBalance = hexToBigInt(nativeResult.result);
  console.log(`Native USDC (18 dec):  ${formatUSDC(nativeBalance, 18)} USDC`);
  console.log(`  Raw (wei):           ${nativeBalance.toString()}`);

  // ERC-20 balanceOf (6 decimals) — eth_call
  const erc20Result = await rpc("eth_call", [
    { to: USDC_ERC20, data: encodeBalanceOf(address) },
    "latest",
  ]);
  if (erc20Result.error) {
    console.error("Error fetching ERC-20 balance:", erc20Result.error.message);
    process.exit(1);
  }
  const erc20Balance = hexToBigInt(erc20Result.result);
  console.log(`\nERC-20 USDC (6 dec):   ${formatUSDC(erc20Balance, 6)} USDC`);
  console.log(`  Raw (wei):           ${erc20Balance.toString()}`);

  // Reconciliation check
  const nativeIn6dec = nativeBalance / 10n ** 12n;
  const diff = nativeIn6dec - erc20Balance;
  console.log(`\n--- Reconciliation ---`);
  console.log(`Native converted to 6 dec: ${formatUSDC(nativeIn6dec, 6)} USDC`);
  console.log(`ERC-20 (6 dec):            ${formatUSDC(erc20Balance, 6)} USDC`);
  if (diff === 0n) {
    console.log("✓ Balances reconcile (exact match at 6-dec precision)");
  } else {
    console.log(`Δ Difference: ${diff.toString()} (expected: truncation of sub-micro-USDC amounts)`);
    console.log("  This is normal — ERC-20 balanceOf truncates below 1e-6 USDC.");
  }

  if (nativeBalance === 0n) {
    console.log("\n⚠️  Wallet has no USDC. Fund via faucet: https://faucet.circle.com");
    console.log("    (Select Arc Testnet as the network)");
  } else {
    console.log(`\n✓ Wallet is funded with ${formatUSDC(nativeBalance, 18)} USDC (native).`);
  }
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
