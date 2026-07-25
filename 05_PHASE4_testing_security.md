# Phase 4 — Testing & Security

**Gate to enter:** Phase 3 done, full flow working end-to-end on testnet through the UI.
**Gate to exit:** self-audit checklist fully passed (sufficient for testnet); external audit completed and signed off (required for mainnet); load test passed; anti-rug mechanics independently verified.

---

## 1. Why this phase is not optional or compressible

Contracts here hold real user funds (USDC in the bonding curve reserves and in
the AMM pairs post-graduation) the moment this goes live. An exploit isn't a
bug report, it's users' money gone and the project's reputation gone with it —
worse for a launchpad than almost any other kind of app, because the entire
pitch is "trust us with your funds in under 60 seconds." Budget real time here
even if it slows the launch date.

---

## 2. Self-audit checklist (minimum bar — sufficient for testnet launch)

- [ ] Reentrancy: every function that transfers USDC or tokens follows checks-effects-interactions, or uses a reentrancy guard
- [ ] Integer overflow/underflow: confirmed safe (Solidity 0.8+ has built-in checks, but double-check any `unchecked` blocks)
- [ ] Access control: every `onlyOwner`/admin function actually has the modifier, no forgotten public function that should be restricted
- [ ] Front-running: buy/sell slippage protection tested against a simulated sandwich attack
- [ ] Migration atomicity: forced-failure test from Phase 1 re-run here as part of the full security pass, not just once during dev
- [ ] **USDC decimal model: verify no code path mixes 6-dec and 18-dec values without explicit conversion.** This is the highest-risk Arc-specific bug class. Trace every USDC transfer in the contracts and confirm the denomination at each step.
- [ ] **Blocklist handling: verify `sell()` reverts cleanly for blocklisted recipients, no stranded funds, no swallowed tokens.** The seller's tokens must remain accessible once the blocklist is resolved.
- [ ] **AMM invariant: constant-product (`x*y=k`) holds under adversarial swap patterns.** The AMM holds real USDC reserves post-graduation — test it like an attacker would.
- [ ] Price manipulation: confirm the bonding curve can't be manipulated by flash-loan-style large single-block buy+sell. Arc currently has no flash loan infrastructure, but `[CONFIRM]` this is still true at audit time — if flash loans or equivalent are added before mainnet, this becomes a live attack surface.
- [ ] Fee logic: confirm creation fee, trading fee, and treasury withdrawal can't be bypassed or drained by an unexpected call path
- [ ] **AMM fee logic: if swap fees are enabled on the AMM pair, verify they accrue correctly and can't be drained.** (Likely N/A in v1 if fees are stripped from the V2 fork, but confirm.)

## 3. External audit (required for mainnet — not optional, not deferrable)

**No mainnet deployment until a completed external review is signed off.**
This is a hard gate, not a "strongly recommended." Testnet launch can proceed
on self-audit alone; mainnet cannot.

Options by budget:
- **Full formal audit** ($15-50k): firms like Trail of Bits, Spearbit, Sigma
  Prime. Gold standard, worth it if budget allows.
- **Lightweight paid review** ($2-5k): smaller firms or well-regarded
  independent auditors. Far cheaper than an exploit. Minimum acceptable bar
  for mainnet.
- **Community review** (free, but not a substitute): open-source the contracts,
  solicit review from Arc ecosystem developers. Useful as a supplement, not a
  replacement for a paid review.

The AMM contracts (AMMFactory + AMMPair) are part of the audit scope — they
hold real USDC reserves post-graduation. Do not exclude them as "just
infrastructure."

## 4. Load testing

- Simulate concurrent buy/sell transactions on a single token approaching the
  graduation threshold — this is the highest-contention moment (everyone
  wants in before the last block before graduation) and where race conditions
  are most likely to surface.
- **AMM swap contention test: post-graduation, simulate heavy swap load on a
  graduated token's AMM pair.** Verify the constant-product invariant holds
  under concurrent swaps and no rounding errors accumulate to an exploitable
  degree.
- Load test the indexer separately from the contracts — confirm it doesn't
  fall behind and silently drop events under a burst of activity (e.g. a
  token going viral and getting 100+ trades in a minute). If using
  Envio/Goldsky, verify their throughput under load; if any self-hosted
  component exists, load test it directly.

## 5. Anti-rug verification (re-verify, don't just trust Phase 1's tests)

- [ ] Manually confirm on `testnet.arcscan.app` that a graduated token's LP is actually burned (sent to a verifiable burn address via our AMM pair's `burn()`), not just that the contract call succeeded
- [ ] Manually confirm ownership renounce actually removes admin capability, not just that the flag is set
- [ ] Confirm max-wallet and cooldown limits hold under adversarial testing (e.g. one actor using multiple wallets to route around max-wallet — acknowledge this is a known limitation of on-chain max-wallet enforcement, not fully solvable, but document it rather than overclaiming protection)
- [ ] Confirm no freeze function exists anywhere in the token contracts (by design — verify the absence, not just that it's not called)

## 6. Definition of done

- [ ] Self-audit checklist fully passed (sufficient for testnet launch)
- [ ] **External audit/review completed and signed off** (required for mainnet — no "deferred" or "scheduled" option)
- [ ] Load test passed at a defined concurrency target (`[CONFIRM]` a number — e.g. 50 concurrent buy txs on one token — based on realistic worst-case for launch day)
- [ ] AMM swap contention test passed
- [ ] Anti-rug mechanics independently re-verified, limitations documented honestly
- [ ] USDC decimal model verified clean across all contract code paths
- [ ] Blocklist edge case behavior verified and documented
