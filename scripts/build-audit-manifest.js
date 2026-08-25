#!/usr/bin/env node
'use strict';

const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { existsSync, readFileSync, writeFileSync } = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const outputPath = path.join(root, 'audit', 'ARTIFACTS.sha256');
const outputName = 'audit/ARTIFACTS.sha256';

const exactFiles = new Set([
  '.env.example',
  '.github/workflows/release-gate.yml',
  'package.json',
  'package-lock.json',
  'contracts/foundry.toml',
  'contracts/remappings.txt',
  'contracts/DEPENDENCIES.md',
  'docs/MAINNET_RUNBOOK.md',
]);

const prefixes = [
  'apps/api/src/',
  'apps/api/db/',
  'apps/web/src/',
  'contracts/src/',
  'contracts/test/',
  'contracts/script/',
  'contracts/lib/forge-std/src/',
  'contracts/lib/solady/src/',
  'packages/shared/src/',
  'scripts/',
  'audit/',
];

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function listedFiles() {
  const stdout = execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    { cwd: root, encoding: 'buffer' },
  );

  return stdout
    .toString('utf8')
    .split('\0')
    .filter(Boolean)
    .map((file) => file.replaceAll('\\', '/'))
    .filter((file) => file !== outputName)
    .filter((file) => exactFiles.has(file) || prefixes.some((prefix) => file.startsWith(prefix)))
    .filter((file) => existsSync(path.join(root, file)))
    .sort((a, b) => a.localeCompare(b, 'en'));
}

function buildManifest() {
  const entries = listedFiles().map((file) => {
    const digest = sha256(readFileSync(path.join(root, file)));
    return `${digest}  ${file}`;
  });
  const payload = `${entries.join('\n')}\n`;
  const aggregate = sha256(Buffer.from(payload, 'utf8'));
  return `# Orba audit input manifest v1\n# aggregate-sha256: ${aggregate}\n${payload}`;
}

const expected = buildManifest();
const verify = process.argv.includes('--verify');
const write = process.argv.includes('--write');

if (verify === write) {
  console.error('Usage: node scripts/build-audit-manifest.js --write|--verify');
  process.exit(2);
}

if (write) {
  writeFileSync(outputPath, expected, 'utf8');
  console.log(`Wrote ${path.relative(root, outputPath)} (${listedFiles().length} files)`);
  console.log(expected.split('\n')[1]);
  process.exit(0);
}

if (!existsSync(outputPath)) {
  console.error(`${outputName} is missing; run with --write`);
  process.exit(1);
}

const actual = readFileSync(outputPath, 'utf8').replaceAll('\r\n', '\n');
if (actual !== expected) {
  console.error(`${outputName} does not match the current audit inputs`);
  process.exit(1);
}

console.log(`${outputName} verified (${listedFiles().length} files)`);
console.log(expected.split('\n')[1]);
