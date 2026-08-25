# Orba external-audit handoff

This directory is the entry point for Orba's mainnet-intended audit candidate.
It freezes code for independent review; it is not an audit report, security
certification, deployment approval, or evidence that Arc mainnet is available.

## Candidate identity

- Candidate tag: `orba-mainnet-audit-rc1`
- Parent production commit: `9ae40db0a07312a38f01beec157db6c8ade89fa0`
- Compiler: Solidity `0.8.26`, optimizer enabled with 200 runs, EVM Cancun
- Source manifest: `ARTIFACTS.sha256`

The annotated Git tag resolves the exact review commit. Auditors should record
both `git rev-parse orba-mainnet-audit-rc1^{commit}` and the manifest aggregate
before work starts. Any in-scope source, dependency, compiler, deployment
script, or security configuration change requires a documented diff review and,
where security-relevant, auditor retest.

## Package map

- `SCOPE.md` — exact code and operational review boundaries.
- `INVARIANTS.md` — properties the review should try to falsify.
- `THREAT_MODEL.md` — actors, trust boundaries and attack surfaces.
- `CONTROL_MATRIX.md` — privileged powers and rug-risk review.
- `EXTERNAL_CALLS.md` — contract call sites and trust assumptions.
- `KNOWN_LIMITATIONS.md` — accepted constraints and unresolved release gates.
- `REPRODUCIBILITY.md` — clean-room build and verification procedure.
- `RFP.md` — requested engagement and deliverables.
- `DEPLOYMENT_MANIFEST.template.md` — post-audit, post-deployment evidence form.
- `ARTIFACTS.sha256` — deterministic hashes of review inputs.

Historical testnet evidence remains in separately dated files and must not be
treated as mainnet evidence.

## Current network gate

As checked on 2026-08-25, Circle's official Arc documentation says Arc is
available on testnet only. It does not publish final mainnet RPC, explorer,
chain, or contract parameters. See <https://docs.arc.io/llms.txt> and
<https://docs.arc.io/arc/references/connect-to-arc.md>.

No mainnet deployment script or populated mainnet manifest is included. Orba
must not deploy until Circle publishes authoritative parameters, the external
audit and fix review are complete, and every release gate in
`docs/MAINNET_RUNBOOK.md` passes.
