#!/usr/bin/env node
'use strict';

const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { config } = require('dotenv');
const { keccak256 } = require('viem');

config({ path: path.resolve(process.env.ENV_FILE || '.env') });

const errors = [];
const checks = [];
const addressPattern = /^0x[0-9a-fA-F]{40}$/;
const testnetAddresses = new Set([
  '0x4058646f179a4f5df430e8e125b8f30ff3489bf9',
  '0x8b59b3c4b7a634d8599e4dfb6891ceefd5ca424b',
  '0x2cac61423fe5d7e74e5f3504901478f52a71156d',
  '0x34d4ec02a916164f178885b7ed05127d40847212',
]);

function requireValue(name) {
  const value = process.env[name]?.trim();
  if (!value) errors.push(`${name} is required`);
  return value || '';
}

function requireExact(name, expected) {
  const value = requireValue(name);
  if (value && value !== expected) errors.push(`${name} must equal ${expected}`);
}

function requireAddress(name) {
  const value = requireValue(name);
  if (value && !addressPattern.test(value)) errors.push(`${name} is not an EVM address`);
  if (testnetAddresses.has(value.toLowerCase())) errors.push(`${name} still uses an Orba testnet address`);
  return value;
}

function requireSecureUrl(name, value, protocol) {
  if (!value) return;
  const values = value.split(',').map((item) => item.trim()).filter(Boolean);
  for (const candidate of values) {
    try {
      const parsed = new URL(candidate);
      if (parsed.protocol !== protocol) errors.push(`${name} must use ${protocol}`);
      if (/localhost|127\.0\.0\.1|testnet/i.test(parsed.hostname)) {
        errors.push(`${name} contains a local or testnet host`);
      }
    } catch {
      errors.push(`${name} contains an invalid URL`);
    }
  }
}

requireExact('ARC_MAINNET_PARAMETERS_APPROVED', 'true');
requireExact('AUTH_ALLOW_INSECURE', 'false');
requireExact('DEPLOYER_ACTIONS_ENABLED', 'false');
requireExact('DEPLOYER_SIGNER_PROVIDER', 'aws-kms');
requireExact('AGENT_EXECUTOR_ENABLED', 'false');
requireExact('MONITORING_ENABLED', 'true');
requireExact('UPSTASH_ALERTS_CONFIGURED', 'true');
requireExact('MAINNET_CONFIGURATION_APPROVED', 'true');
requireExact('INCIDENT_CONTACTS_CONFIGURED', 'true');
requireExact('CONTRACT_SOURCES_VERIFIED', 'true');
requireExact('PRODUCTION_GRADUATION_TEST_PASSED', 'true');

const rpcUrls = requireValue('ARC_RPC_URLS');
const explorerApiUrl = requireValue('ARC_EXPLORER_API_URL');
requireSecureUrl('ARC_RPC_URLS', rpcUrls, 'https:');
requireSecureUrl('ARC_EXPLORER_API_URL', explorerApiUrl, 'https:');
requireSecureUrl('ARC_WS_URL', requireValue('ARC_WS_URL'), 'wss:');
requireSecureUrl('REDIS_URL', requireValue('REDIS_URL'), 'rediss:');
requireSecureUrl('ALERT_WEBHOOK_URL', requireValue('ALERT_WEBHOOK_URL'), 'https:');

for (const name of [
  'ARC_USDC_ADDRESS',
  'ARC_TOKEN_FACTORY_ADDRESS',
  'ARC_TREASURY_ADDRESS',
  'ARC_MIGRATOR_ADDRESS',
  'ARC_AMM_FACTORY_ADDRESS',
  'ARC_AMM_ROUTER_ADDRESS',
  'ARC_TIMELOCK_ADDRESS',
  'ADMIN_MULTISIG',
  'AWS_KMS_EXPECTED_ADDRESS',
]) requireAddress(name);

for (const name of [
  'ARC_TOKEN_FACTORY_RUNTIME_CODE_HASH',
  'ARC_TREASURY_RUNTIME_CODE_HASH',
  'ARC_MIGRATOR_RUNTIME_CODE_HASH',
  'ARC_AMM_FACTORY_RUNTIME_CODE_HASH',
  'ARC_AMM_ROUTER_RUNTIME_CODE_HASH',
  'ARC_TIMELOCK_RUNTIME_CODE_HASH',
  'EXTERNAL_AUDIT_REPORT_URL',
  'EXTERNAL_AUDIT_COMMIT',
  'BACKUP_RESTORE_DRILL_AT',
  'POSTGRES_SSL_CA_BASE64',
  'POSTGRES_RUNTIME_ROLE',
  'POSTGRES_RUNTIME_PASSWORD',
  'AWS_REGION',
  'AWS_KMS_KEY_ID',
  'DEPLOYER_MAX_ACTION_MICRO_USDC',
  'DEPLOYER_MAX_BALANCE_MICRO_USDC',
  'DEPLOYER_MIN_BALANCE_MICRO_USDC',
  'PLATFORM_DEPLOYER_DAILY_LIMIT_MICRO_USDC',
  'PLATFORM_DEPLOYER_MONTHLY_LIMIT_MICRO_USDC',
  'REDIS_KEY_WARN_COUNT',
  'PRODUCTION_GRADUATION_EVIDENCE_URL',
]) requireValue(name);

requireSecureUrl(
  'PRODUCTION_GRADUATION_EVIDENCE_URL',
  process.env.PRODUCTION_GRADUATION_EVIDENCE_URL || '',
  'https:',
);

for (const name of [
  'PRODUCTION_GRADUATION_TX_HASH',
  'PRODUCTION_AMM_BUY_TX_HASH',
  'PRODUCTION_AMM_SELL_TX_HASH',
]) {
  const value = requireValue(name);
  if (value && !/^0x[0-9a-fA-F]{64}$/.test(value)) errors.push(`${name} is not a transaction hash`);
}

if (process.env.DEPLOYER_PRIVATE_KEY) {
  errors.push('DEPLOYER_PRIVATE_KEY must not exist in a mainnet environment');
}
if (/localhost|127\.0\.0\.1/i.test(process.env.POSTGRES_HOST || '')) {
  errors.push('POSTGRES_HOST must not be local');
}
if (/^(postgres|supabase_admin)$/i.test(process.env.POSTGRES_RUNTIME_ROLE || '')) {
  errors.push('POSTGRES_RUNTIME_ROLE must be a least-privilege application role');
}
if ((process.env.CORS_ORIGIN || '').split(',').some((v) => /localhost|127\.0\.0\.1/i.test(v))) {
  errors.push('CORS_ORIGIN must not contain local origins in mainnet production');
}

try {
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  if (process.env.EXTERNAL_AUDIT_COMMIT && process.env.EXTERNAL_AUDIT_COMMIT !== head) {
    errors.push('EXTERNAL_AUDIT_COMMIT does not match the checked-out commit');
  } else {
    checks.push(`audited commit matches ${head.slice(0, 12)}`);
  }
} catch {
  errors.push('Unable to read the current git commit');
}

async function rpc(method, params) {
  let lastError;
  for (const url of rpcUrls.split(',').map((v) => v.trim()).filter(Boolean)) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = await response.json();
      if (body.error) throw new Error(body.error.message || 'RPC error');
      return body.result;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error('No RPC URL configured');
}

async function requireVerifiedSource(addressName) {
  const address = process.env[addressName];
  if (!addressPattern.test(address || '') || !explorerApiUrl) return;
  const response = await fetch(
    `${explorerApiUrl.replace(/\/$/, '')}/api/v2/smart-contracts/${address}`,
    { headers: { accept: 'application/json' } },
  );
  if (!response.ok) throw new Error(`${addressName} explorer lookup returned HTTP ${response.status}`);
  const contract = await response.json();
  if (contract.is_verified !== true) {
    errors.push(`${addressName} source is not verified on the configured explorer`);
  } else {
    checks.push(`${addressName} source verified on explorer`);
  }
}

async function main() {
  const configuredChainId = Number.parseInt(process.env.ARC_CHAIN_ID || '', 10);
  if (!Number.isSafeInteger(configuredChainId) || configuredChainId <= 0) {
    errors.push('ARC_CHAIN_ID must be a positive integer');
  } else if (configuredChainId === 5_042_002) {
    errors.push('ARC_CHAIN_ID still points to Arc Testnet');
  }

  if (rpcUrls) {
    try {
      const chainId = Number.parseInt(await rpc('eth_chainId', []), 16);
      if (chainId !== configuredChainId) {
        errors.push(
          `RPC returned chain ID ${chainId}, expected configured ARC_CHAIN_ID ${configuredChainId}`,
        );
      } else {
        checks.push(`RPC chain ID matches configured ARC_CHAIN_ID ${configuredChainId}`);
      }

      const contracts = [
        ['TOKEN_FACTORY', 'ARC_TOKEN_FACTORY_ADDRESS'],
        ['TREASURY', 'ARC_TREASURY_ADDRESS'],
        ['MIGRATOR', 'ARC_MIGRATOR_ADDRESS'],
        ['AMM_FACTORY', 'ARC_AMM_FACTORY_ADDRESS'],
        ['AMM_ROUTER', 'ARC_AMM_ROUTER_ADDRESS'],
        ['TIMELOCK', 'ARC_TIMELOCK_ADDRESS'],
      ];
      for (const [label, addressName] of contracts) {
        const address = process.env[addressName];
        if (!addressPattern.test(address || '')) continue;
        const code = await rpc('eth_getCode', [address, 'latest']);
        if (!code || code === '0x') {
          errors.push(`${addressName} has no deployed bytecode`);
          continue;
        }
        const expected = process.env[`ARC_${label}_RUNTIME_CODE_HASH`];
        const actual = keccak256(code);
        if (expected && actual.toLowerCase() !== expected.toLowerCase()) {
          errors.push(`${addressName} runtime bytecode hash does not match the audited manifest`);
        } else if (expected) {
          checks.push(`${label} bytecode hash matches`);
        }
        await requireVerifiedSource(addressName);
      }
    } catch (error) {
      errors.push(`Mainnet RPC verification failed: ${error.message}`);
    }
  }

  if (errors.length) {
    console.error('MAINNET READINESS: FAIL');
    for (const error of errors) console.error(`- ${error}`);
    process.exitCode = 1;
    return;
  }
  console.log('MAINNET READINESS: PASS');
  for (const check of checks) console.log(`- ${check}`);
}

main().catch((error) => {
  console.error(`MAINNET READINESS: ERROR - ${error.message}`);
  process.exitCode = 1;
});
