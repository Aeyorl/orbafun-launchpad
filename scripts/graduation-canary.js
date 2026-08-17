#!/usr/bin/env node

/**
 * Safe, deterministic graduation canary.
 *
 * This intentionally runs only a local Foundry test. It launches a token,
 * crosses the bonding-curve threshold, verifies automatic AMM migration and
 * LP burn, then executes router buy and sell swaps. It never reads private
 * keys, broadcasts a transaction, or spends testnet funds.
 */
const {execFileSync} = require('node:child_process');
const path = require('node:path');

const contractsDirectory = path.join(__dirname, '..', 'contracts');

console.log('Running local automatic-graduation canary (no network transactions).');
execFileSync(
  'forge',
  ['test', '--match-test', 'test_AutomaticGraduationCanary_AndPostGraduationRouterTrade', '-vv'],
  {cwd: contractsDirectory, stdio: 'inherit'},
);
