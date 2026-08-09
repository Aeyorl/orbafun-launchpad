/**
 * Live testnet smoke test for IPFS image upload and creator-only social links.
 *
 * Usage: node scripts/test-live-metadata.js <token-address> [image-path]
 */
require('dotenv').config();

const fs = require('node:fs');
const path = require('node:path');
const { privateKeyToAccount } = require('viem/accounts');

const API = (process.env.E2E_API_URL || 'https://orbafun-api.onrender.com').replace(/\/$/, '');
const tokenAddress = process.argv[2];
const imagePath = path.resolve(process.argv[3] || 'apps/web/public/orba-icon-192.png');

async function requireOk(response, label) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`${label} failed (${response.status}): ${JSON.stringify(body)}`);
  }
  return body;
}

async function main() {
  if (!process.env.DEPLOYER_PRIVATE_KEY) throw new Error('DEPLOYER_PRIVATE_KEY not set');
  if (!/^0x[0-9a-fA-F]{40}$/.test(tokenAddress || '')) throw new Error('Valid token address required');
  if (!fs.existsSync(imagePath)) throw new Error(`Image not found: ${imagePath}`);

  const account = privateKeyToAccount(process.env.DEPLOYER_PRIVATE_KEY);
  console.log('Checking upload configuration...');
  const status = await requireOk(await fetch(`${API}/upload/status`), 'upload status');
  if (!status.enabled) throw new Error('Live image uploads are disabled');

  console.log('Uploading image to IPFS...');
  const form = new FormData();
  form.append('file', new Blob([fs.readFileSync(imagePath)], { type: 'image/png' }), path.basename(imagePath));
  const uploaded = await requireOk(
    await fetch(`${API}/upload/image`, { method: 'POST', body: form }),
    'image upload',
  );

  console.log('Checking uploaded image gateway...');
  const imageFetch = await fetch(uploaded.gateway);
  if (!imageFetch.ok) throw new Error(`Uploaded image is not retrievable (${imageFetch.status})`);

  console.log('Authenticating token creator...');
  const { nonce } = await requireOk(await fetch(`${API}/auth/nonce`), 'auth nonce');
  const issuedAt = new Date();
  const message = [
    'www.orba.fun wants you to sign in with your Ethereum account:',
    account.address,
    '',
    'Sign in to Orba',
    '',
    'URI: https://www.orba.fun',
    'Version: 1',
    'Chain ID: 5042002',
    `Nonce: ${nonce}`,
    `Issued At: ${issuedAt.toISOString()}`,
    `Expiration Time: ${new Date(issuedAt.getTime() + 5 * 60_000).toISOString()}`,
  ].join('\n');
  const signature = await account.signMessage({ message });
  const auth = await requireOk(
    await fetch(`${API}/auth/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, signature }),
    }),
    'auth verify',
  );

  const expected = {
    website: 'https://www.orba.fun',
    twitter: 'orbafun',
    telegram: 'https://t.me/orbafun',
    discord: 'https://discord.gg/orbafun',
    description: 'Automated live readiness test: image upload and social links verified.',
    banner: uploaded.uri,
  };
  console.log('Saving social links and banner...');
  await requireOk(
    await fetch(`${API}/tokens/${tokenAddress}/metadata`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-auth-token': auth.token },
      body: JSON.stringify(expected),
    }),
    'metadata update',
  );
  console.log('Reading metadata back...');
  const stored = await requireOk(
    await fetch(`${API}/tokens/${tokenAddress}/metadata`),
    'metadata read',
  );
  for (const [key, value] of Object.entries(expected)) {
    if (stored[key] !== value) throw new Error(`Metadata mismatch for ${key}`);
  }

  console.log(JSON.stringify({ tokenAddress, imageUri: uploaded.uri, gateway: uploaded.gateway, metadata: stored }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
