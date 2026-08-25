# Request for proposal: Orba security review

Orba is a Solidity token launchpad intended for Arc. It uses USDC-denominated
constant-product bonding curves, fixed-supply tokens, automatic graduation to a
purpose-built zero-fee AMM, burned LP tokens and timelocked administration.

We request:

1. Full manual review of the contract and operational scope in `SCOPE.md`.
2. Economic, invariant and adversarial-ordering review of curve, migration and
   AMM behavior.
3. Arc-specific review of native and ERC-20 USDC representations and EVM
   differences, using Circle's final documentation when available.
4. Application review of wallet authorization, platform-funded agent controls,
   RPC/indexer trust boundaries, configuration and transaction presentation.
5. A remediation review pinned to an exact commit and a final public report.
6. Post-launch verification of deployment bytecode, constructor/immutable
   values, owners, Safe, guardian and timelock configuration.

Please quote named reviewers, team size, start date, duration, price, retest
terms, report-publication policy and relevant bonding-curve, AMM, launchpad and
Arc experience. Confirm whether application/operations review is included or
quoted separately.

Candidate firms for proposal requests include OpenZeppelin Security, Trail of
Bits, Zellic and Spearbit. No provider is selected by this document; selection
must weigh methodology, reviewer fit, availability and fix-review terms.

The engagement must record the candidate tag, resolved commit, compiler settings
and `ARTIFACTS.sha256` aggregate before review begins. Testnet results are
supporting evidence only and are not proof of mainnet safety.
