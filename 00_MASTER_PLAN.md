# Orba — Master Build Plan (Standalone)

## 0. Vision

First memecoin launchpad on Arc. Launch and trade tokens in under 60 seconds
using USDC. Pump.fun mechanics, Arc-native, stablecoin-denominated.

This is a clean, standalone build — no dependency on any other project's
infra, contracts, or wallet/billing logic. Everything here is self-contained.

---

## 1. Phase overview

| Phase | Name | Duration (realistic solo estimate) | Gate to next phase |
|---|---|---|---|
| 0 | Research & Foundation | 1.5–2 weeks | Arc contracts understood, repo boots, testnet wallet funded, USDC dual-decimal model documented |
| 1 | Smart Contracts | 3.5–4 weeks | Full create→buy→sell→graduate flow works on testnet (including own AMM), tested |
| 2 | Backend + Indexer | 1.5–2 weeks | Indexer correctly tracks a full token lifecycle, API serves real data |
| 3 | Frontend | 2–2.5 weeks | A user can launch a token and trade it end-to-end through the UI |
| 4 | Testing & Security | 1.5–2 weeks | Contracts audited (self for testnet, external required for mainnet), anti-rug checks verified |
| 5 | Public Launch | ongoing (gated on Arc mainnet) | First 10 real tokens launched by real (non-test) users |

Realistic total: **15–17 weeks** solo. The contracts phase grew because we're
building our own AMM for graduation (no on-chain DEX exists on Arc yet), and
the indexer phase shrank because we're using Envio/Goldsky instead of building
from scratch. Budget for the full range — the contracts and AMM are where
corner-cutting shows up as exploits or bad data later.

**Mainnet dependency:** Arc is currently testnet-only. The product can be fully
built and tested on testnet, but cannot launch to real users until Arc mainnet
is live. No mitigation for this — it's an external dependency. Plan for
testnet-complete as the v1 milestone; mainnet launch is gated on Arc + external
audit.

---

## 2. Non-negotiable anti-rug mechanics (build these first, not last)

These are listed in Phase 1 but flagged here because they're easy to defer and
that's exactly how launchpads end up with a bad reputation:

- LP burned on graduation into our own AMM, no exceptions, no admin override.
- No mint function post-launch on any created token.
- Creator ownership renounced automatically on graduation.
- Max wallet holding % enforced pre-graduation (prevents single-wallet dominance).
- Transaction cooldown post-launch (prevents sniping bots in the first blocks).
- No freeze function on tokens — fully immutable post-launch, by design. A real
  security issue is handled at the factory level (pause new launches), not by
  freezing existing tokens. This is a deliberate trustlessness choice.

Build and test these alongside the bonding curve itself in Phase 1, not
bolted on afterward.

---

## 3. Arc-specific technical realities (affect multiple phases)

These are confirmed from Arc docs and shape the build:

- **USDC is the native gas token.** Gas is paid in USDC (~$0.01/tx, EWMA-smoothed,
  no EIP-1559 burn). "No USDC" means a user can't even submit a transaction, not
  just that they can't trade. The frontend must handle this state explicitly.
- **USDC has a dual-decimal model.** Native USDC = 18 decimals (gas, msg.value,
  addr.balance). ERC-20 USDC = 6 decimals (transferFrom, approve, balanceOf).
  Both are the same asset. The bonding curve must pick one denomination for
  internal accounting and convert at boundaries. Mixing them without conversion
  is a critical accounting bug. See Phase 1.
- **EIP-7708 dual Transfer events.** Every USDC movement emits a Transfer log
  from a system emitter (18 dec). ERC-20 transfers emit an ADDITIONAL Transfer
  from the ERC-20 contract (6 dec). The indexer must filter on one emitter to
  avoid double-counting. See Phase 2.
- **Deterministic finality, instant.** Transactions finalize on inclusion; N=1
  confirmation is sufficient. No reorg handling needed. Simplifies the indexer.
- **Sub-second block time.** Cooldown logic must be sized in block terms against
  Arc's actual block time, not borrowed from Ethereum's 12s blocks. A "10 block
  cooldown" on Arc is ~5 seconds, not 120.
- **Local Foundry/anvil tests are insufficient.** anvil runs a standard EVM, not
  Arc's. USDC native-coin behavior, EIP-7708 events, and blocklist enforcement
  only surface against an Arc RPC endpoint. Phase 1 needs an Arc-testnet
  integration test tier alongside forge tests.
- **No on-chain DEX/AMM exists on Arc.** Graduation migrates the bonding curve
  reserve into our own minimal Uniswap V2-style AMM (deployed as part of this
  project). See Phase 1, section 6.

---

## 4. Execution notes (for whichever AI coding agent or dev tool you run this through)

- Feed one phase file at a time. Confirm the "Definition of done" checklist for
  a phase before moving to the next one's spec.
- If a phase's spec is ambiguous on a specific number (fees, thresholds), the
  agent should flag it and ask rather than inventing a number — several exact
  values are marked `[CONFIRM]` below for that reason.
- Keep a running decision log (date, decision, reason) so later phases don't
  silently contradict earlier ones.
- Install the Circle `use-arc` skill (`npx skills add circlefin/skills`) before
  starting Phase 0 implementation — it gives any AI agent Arc-specific guidance
  without manual doc pasting.
- Consider setting up the Arc MCP server (`/ai/mcp.md` in Arc docs) for direct
  doc access from AI tools.

---

## 5. File index

- `01_PHASE0_research_foundation.md`
- `02_PHASE1_contracts.md`
- `03_PHASE2_backend_indexer.md`
- `04_PHASE3_frontend.md`
- `05_PHASE4_testing_security.md`
- `06_PHASE5_launch_growth.md`
