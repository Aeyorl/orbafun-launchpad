# Reproducible audit procedure

## Pin the candidate

```bash
git fetch --tags origin
git checkout --detach orba-mainnet-audit-rc1
git rev-parse HEAD
git status --short
node scripts/build-audit-manifest.js --verify
```

The checkout must be clean and manifest verification must pass. Record the
resolved commit and aggregate printed by the verifier.

## Baseline toolchain

- Foundry `1.7.1` (`4072e48705af9d93e3c0f6e29e93b5e9a40caed8`)
- Solidity `0.8.26` (downloaded/pinned by Foundry)
- Optimizer enabled, 200 runs; EVM Cancun
- Node.js `24.12.0`; npm `11.19.0`
- Vendored dependency commits and provenance: `contracts/DEPENDENCIES.md`

Reviewers may use newer analysis tools, but must record versions and rerun the
pinned compiler build for artifact comparison.

## Verification commands

```bash
forge clean --root contracts
forge build --root contracts --sizes
forge test --root contracts -vv
npm ci --ignore-scripts
npm run lint
npm test
npm run build
git diff --check
node scripts/build-audit-manifest.js --verify
```

Arc integration tests and E2E/load tests require funded, authorized testnet
accounts and current official testnet RPCs. They must never target mainnet during
the audit. Record RPC head, transactions, exact commands and any skipped tests.

## Eventual deployment comparison

After Arc mainnet is officially documented and the audit/fix review is closed:

1. Create and independently review a mainnet-only deployment script with an
   explicit official chain guard and official USDC address/code check.
2. Rebuild from the audited remediation tag with the pinned toolchain.
3. Record creation transactions, constructor arguments, immutable values and raw
   plus immutable-normalized runtime hashes.
4. Verify source on the official explorer and have a second reviewer reproduce
   every row in `DEPLOYMENT_MANIFEST.template.md` before public cutover.
