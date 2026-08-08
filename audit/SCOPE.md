# Orba external security review scope

The audit target is the exact commit recorded in `EXTERNAL_AUDIT_COMMIT`. Any
post-audit source change invalidates deployment approval until the auditor has
reviewed the diff.

## In-scope contracts

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
- `contracts/script/DeployArcFun.s.sol`

## Required review areas

1. Bonding-curve arithmetic, rounding, graduation threshold, partial fills,
   max-wallet and cooldown behavior.
2. Exact accounting for 6-decimal ERC-20 USDC versus 18-decimal Arc native
   USDC, including Arc's non-standard `transferFrom` return behavior.
3. Reentrancy, allowance lifecycle, slippage/deadline enforcement and token
   callback behavior.
4. Migration atomicity, balance isolation, LP mint/burn correctness, token
   ownership renunciation and permissionless migration.
5. AMM invariant behavior, canonical-pair enforcement, reserve manipulation,
   donated balances, concurrent routing and zero-fee economics.
6. Timelock operation identity, replay/cancellation, reentrancy, Safe rotation,
   delay modification and emergency guardian privilege boundaries.
7. Factory fee cap, treasury withdrawal authority and all owner/admin paths.
8. Deployment script correctness and equality between audited source,
   compiler settings, creation bytecode and deployed runtime bytecode.

## Deliverables

- Written report with severity, exploit scenario, impact and remediation.
- Fix review against a pinned remediation commit.
- Deployment verification of mainnet runtime bytecode and constructor values.
- Explicit statement of unreviewed assumptions and Arc-specific limitations.

The API, web application, database policies, CI/CD, cloud accounts and key
management are requested as a separate application/operational assessment.
