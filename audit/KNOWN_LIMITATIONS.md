# Known limitations and open release gates

These items are disclosed to reviewers; none should be interpreted as accepted
mainnet risk without explicit disposition.

## Hard blockers

- Arc's official documentation said testnet-only on 2026-08-25. Final mainnet
  chain ID, RPC, explorer, USDC/system contracts and EVM behavior are unavailable.
- No independent external audit or remediation review has been completed.
- No Arc mainnet contracts, verified bytecode, ownership evidence or production
  canary exist.
- Platform-funded agents remain disabled for mainnet pending separate signer,
  IAM, transaction-builder and spend-policy review.

## Design and operational constraints

- The AMM intentionally charges 0% swap fees. It is purpose-built, not a full
  Uniswap V2 implementation, and has no protocol fee switch.
- Direct AMMPair callers use transfer-then-swap semantics and can race or consume
  donated input. Orba's intended user path is the atomic AMMRouter with current
  quote, deadline and slippage protection.
- Anyone may trigger an eligible migration. Correctness relies on atomic state
  transitions and factory-canonical pair creation, not caller authorization.
- Tokens have uncapped holdings. The cooldown is not anti-Sybil protection and
  does not prevent concentration, manipulation or coordinated wallets.
- LP tokens are burned and cannot be recovered or repositioned. Zero-fee AMM
  liquidity has no fee-funded growth beyond rounding/donations.
- On-chain records are immutable, while profiles, messages, images and token
  metadata are off-chain, mutable and may become unavailable.
- Indexer, API, rankings, referrals and caches are derived state. Referral
  rewards accrue off-chain and are not an automatic on-chain payout obligation.
- Testnet, unit, fuzz/static or internal-review results do not substitute for a
  credentialed independent audit or mainnet deployment verification.
- Formal verification has not been performed. Slither, Semgrep and Mythril are
  not installed in the baseline Windows environment; auditors should run their
  own toolchain and report versions/configuration.
