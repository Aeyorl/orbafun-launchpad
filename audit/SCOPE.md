# Orba external security review scope

The audit target is the commit resolved by tag `orba-mainnet-audit-rc1` and the
files hashed in `ARTIFACTS.sha256`. Review findings must identify that commit.

## Primary smart-contract scope

- `contracts/src/TokenFactory.sol`
- `contracts/src/MemeToken.sol`
- `contracts/src/BondingCurve.sol`
- `contracts/src/Treasury.sol`
- `contracts/src/LiquidityMigration.sol`
- `contracts/src/AMMFactory.sol`
- `contracts/src/AMMPair.sol`
- `contracts/src/AMMRouter.sol`
- `contracts/src/ProtocolTimelock.sol`
- `contracts/src/SafeUSDC.sol`
- `contracts/script/DeployArcFun.s.sol` (testnet reference only)
- `contracts/script/TransferOwnership.s.sol`
- `contracts/foundry.toml` and imported Solidity dependencies

All files under `contracts/test/` and `contracts/src/test/` are in scope as test
evidence, but test-only contracts are not intended for production deployment.

## Required contract review

1. Constant-product bonding-curve arithmetic, rounding, partial fills, fixed
   supply, uncapped holdings, cooldown semantics and graduation threshold.
2. Six-decimal ERC-20 USDC versus 18-decimal native Arc USDC accounting,
   including Arc's non-standard `transferFrom` return behavior.
3. Reentrancy, approvals, slippage/deadlines, fee accounting and token callback
   or non-standard-token behavior.
4. Permissionless migration, atomicity, balance isolation, liquidity minting,
   LP burn, curve closure and ownership renunciation.
5. AMM invariant behavior, canonical-pair enforcement, reserve donations,
   direct-pair calls, concurrent routing and zero-fee economics.
6. Timelock identity/replay/cancellation, reentrancy, Safe rotation, delay
   changes and emergency guardian boundaries.
7. Factory fee cap, Treasury authority, ownership transfers and every privileged
   state transition.
8. Build/deployment reproducibility, constructor values, immutables and equality
   between audited artifacts and eventual deployed runtime bytecode.

## Application and operational scope

Review the security-critical paths that can create, submit, observe or present
transactions, even though they are not blockchain consensus:

- `apps/api/src/agents/`, authentication/authorization, RPC proxy, indexer,
  WebSocket publication, configuration validation and database migrations.
- Frontend wallet connection, launch/trade approvals, slippage, network pinning,
  token metadata and transaction status handling.
- `scripts/validate-mainnet-readiness.js`, `.github/workflows/release-gate.yml`,
  `docs/MAINNET_RUNBOOK.md`, signer/KMS controls and environment boundaries.
- PostgreSQL/Supabase, Redis/Upstash, Render, Vercel, RPC providers, Safe and
  timelock operational configuration using redacted evidence only.

Secrets, production credentials, private keys and live exploit testing are out
of scope. Reviewers receive read-only configuration evidence and architecture
screenshots through an approved secure channel.

## Deliverables

- Written report with severity, location, exploit scenario, impact, likelihood
  and remediation.
- Explicit coverage limitations and Arc-specific assumptions.
- Fix review pinned to a remediation commit.
- Reproducible compiler/build evidence and eventual deployment bytecode,
  constructor/immutable and ownership verification.
- Separate statement of whether application/operational scope was completed.
