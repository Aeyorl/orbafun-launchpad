# Slither scan evidence — 2026-08-30

This is internal pre-audit hardening evidence. It is not an independent audit,
security certification, mainnet approval, or a change to the frozen audit
candidate.

## Candidate and tool identity

- Candidate tag: `orba-mainnet-audit-rc1`
- Candidate commit: `5a26af6a8e6329feef78242dd3b87ea09ef86934`
- Candidate worktree: clean before and after the scan
- Slither: `0.11.6`
- Foundry: `1.7.1`
- Solidity: `0.8.26`, optimizer enabled with 200 runs, EVM Cancun
- Scan timestamp: `2026-08-30T01:31:47Z`

The scan ran from a separate worktree pinned to the candidate commit. The
annotated tag and its files were not modified.

## Commands

```powershell
forge build --root contracts

slither . `
  --compile-force-framework foundry `
  --json C:\Project folder\orba-security-scan-output\2026-08-30\slither-results.json

slither . `
  --compile-force-framework foundry `
  --filter-paths "(lib|src/test)" `
  --json C:\Project folder\orba-security-scan-output\2026-08-30\slither-production-results.json

forge test --root contracts
```

## Results

The full scan analyzed 29 contracts with 102 detectors and emitted 111 raw
results, including vendored dependencies and test-only contracts. The filtered
production report emitted 53 raw results:

| Scanner impact | Raw results |
|---|---:|
| High | 3 |
| Medium | 15 |
| Low | 23 |
| Informational | 10 |
| Optimization | 2 |

These counts are detector output, not confirmed vulnerabilities. Manual triage
found **no confirmed critical, high, or medium vulnerability** in the candidate.

### High-impact detector triage

| Detector | Raw results | Disposition |
|---|---:|---|
| `arbitrary-send-eth` | 1 | Intended timelock behavior. Only a previously queued operation whose hash binds chain, timelock, target, value, calldata, and salt can execute. Queueing is restricted to the admin Safe. |
| `reentrancy-balance` | 1 | Not exploitable through the reviewed path. `BondingCurve.buy` is protected by `nonReentrant`; the balance delta check intentionally rejects fee-on-transfer or otherwise non-exact USDC behavior. |
| `reentrancy-eth` | 1 | Not exploitable through the reviewed path. `ProtocolTimelock.execute` deletes the queued operation before the call and sets an explicit `executing` lock around the call. A failed target call reverts the entire transaction and restores state. |

### Other detector triage

- The six `divide-before-multiply` results describe intentional integer fee
  rounding in six-decimal USDC accounting. Existing tests cover fee accounting
  and full lifecycle behavior.
- The three `incorrect-equality` results are AMM initialization and
  zero-liquidity guards, where exact equality is required.
- Reentrancy results for bonding-curve and AMM entry points are covered by
  `nonReentrant`. The migration path operates only on factory-created Orba
  tokens, curves and pairs, and records the pair before subsequent external
  calls.
- Ignoring the third `getReserves` return value and the return value from
  `AMMPair.mint` is intentional; the timestamp is not used by the router, and
  `mint` reverts on failure while its returned liquidity amount is not needed.
- Timestamp comparisons implement swap deadlines and the minimum 24-hour
  timelock delay. Validator timestamp tolerance is not material to those uses.
- Low-level calls are intentional for Arc USDC's non-standard return behavior
  or for the timelock's generic queued execution. Success and optional Boolean
  return data are checked where applicable.
- Missing zero-address checks are largely constrained by factory deployment and
  configuration validation. Adding recipient checks to treasury withdrawals
  remains a reasonable defense-in-depth improvement against operator error,
  but the scanner did not establish an unprivileged exploit path.
- Dependency assembly and pragma findings appear only in pinned Solady or
  forge-std sources and were excluded from the production-only report.

## Verification

- Candidate build: passed.
- Foundry tests: **48 passed, 0 failed, 0 skipped**, including 10 Arc integration
  tests.
- Candidate worktree: clean after verification.

Raw result hashes:

- Full report SHA-256:
  `34b7e0956fe66509d4292ebdb7d6a7c1a8e787ef0f95ca04ef6b758bb8c9d131`
- Production-filtered report SHA-256:
  `b2b1c4e388100f32f5f2d10339487b89ee1779ba9b855551b27fc7f413f7c5db`

The generated JSON files remain outside the repository so they do not alter the
frozen audit package. An independent auditor must still review the contracts,
economic invariants, privileged controls, deployment configuration and final
bytecode. Mainnet remains **NO-GO pending external audit and all runbook gates**.
