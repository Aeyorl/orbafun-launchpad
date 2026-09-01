# Phase 5 — Public Launch & Growth

**Gate to enter:** Phase 4 done — security pass complete, external audit signed
off, contracts ready for real funds.
**Gate to exit:** first 10 real (non-test) tokens launched by real users, revenue model live and collecting fees correctly.

---

## 0. Mainnet dependency (read before planning launch timing)

Mainnet launch is gated on **two** external conditions, not one:

1. **Arc mainnet is live.** As of plan writing, Arc is testnet-only; mainnet
   endpoints are "published when available." The product can be fully built and
   tested on testnet, but cannot launch to real users until Arc mainnet ships.
   Monitor Arc's deployment model page and announcements.
2. **External audit completed and signed off.** Per Phase 4, no mainnet
   deployment without a completed external review.

Until both are met, the product is testnet-complete but not launchable. Plan
testnet-complete as the v1 milestone. Use the waiting period for: external
audit, load testing refinement, growth feature prep, and seeding creator
relationships.

---

## 1. Revenue model — implementation checklist

| Fee | Value | Where enforced |
|---|---|---|
| Creation fee | `[CONFIRM]`, doc suggests 5 USDC | `TokenFactory.createToken()` |
| Trading fee | **1%, split 0.5% creator / 0.5% protocol** (resolved — see DECISION_LOG D19) | `BondingCurve.buy()`/`sell()` — creator fees accrue during bonding curve phase only, claimable anytime |
| AMM swap fee | **0.3%, retained entirely in AMM reserves** | `AMMPair.swap()` enforces the fee in the invariant. The migration sends all usable LP tokens to `0x...dEaD`, so Orba and creators cannot withdraw the accumulated fee liquidity. |
| Featured placement | `[CONFIRM]`, doc suggests 100 USDC/day | New: `Featured.sol` or extend `Treasury.sol` — build only when first requested, don't pre-build |
| Verification badge | `[CONFIRM]`, doc suggests 50 USDC | Same — build on demand |
| Token boosts | `[CONFIRM]`, doc suggests 20–500 USDC | Same — build on demand |

The AMM fee is not protocol revenue. It remains in the pair, increasing the
reserves represented by permanently burned LP tokens. There is no protocol-fee
switch and no creator withdrawal path for post-graduation swap fees.

Featured/verification/boosts are monetization features for once there's actual
traffic to sell placement against — building them before you have users to
sell to is wasted surface area and wasted attack surface.

---

## 2. Growth features — build order

Ship in this order, each gated on the previous actually being used:

1. **Live trade feed** — already built in Phase 3, this is your core virality loop, make sure it's fast and prominent.
2. **Referral links** — wallet-tagged attribution is built. The displayed reward is off-chain accounting only: a database record of potential reward, not USDC held for the referrer and not a withdrawable balance. Do not market it as payable until a funded claim or distribution process is implemented and published.
3. **Leaderboards** — top creators, top gainers — cheap to build once the DB has real data, don't build against empty/test data (looks broken, not exciting).
4. **Share card generation** — auto-generated image (token name, price chart snippet, market cap) for social sharing — genuinely useful for virality, worth prioritizing over meme generator.
5. **Meme generator** — lowest priority of the growth features, nice-to-have, build last if at all.

## 3. Anti-rug messaging (part of growth, not just security)

Your anti-rug mechanics from Phase 1 are also a marketing asset — surface them
explicitly on the launch page and coin page:

- "LP burned on graduation" (into our own AMM — still a valid claim, the LP
  tokens are sent to a verifiable burn address)
- "No mint function"
- "Ownership renounced automatically"
- "No freeze function — tokens are fully immutable"

Traders comparing launchpads look for exactly this. Don't bury it in a docs
page. The "no freeze" claim is a differentiator — many launchpads reserve a
freeze capability "for emergencies," which is also a rug vector. Advertising
its absence is a trust signal.

## 4. Launch campaign checklist

- [ ] Twitter/X presence live before first public token launch, not after
- [ ] Identify 3-5 early creators (communities, KOLs) to seed the first wave of launches — a launchpad with zero tokens on it looks dead, avoid a cold empty landing page
- [ ] Keep AI-agent navigation and routes hidden, with platform-funded execution disabled, until that product is deliberately relaunched
- [ ] Have a monitoring plan for the first 48 hours — the monitoring from Phase 2 is live, but have someone watching the dashboard in real time for the first 48h, not just checking in the next morning. Watch: indexer lag, contract gas costs under real load, AMM pair health, support requests.
- [ ] Confirm Arc mainnet is live and stable before scheduling the launch campaign — don't announce a launch date before the chain is ready

## 5. Definition of done

- [ ] Arc mainnet is live (external dependency — cannot control this)
- [ ] External audit completed and signed off
- [ ] Creation fee and trading fee live and collecting correctly, verified against real mainnet transactions
- [ ] 10 real tokens launched by real users (not test wallets)
- [ ] Graduation flow works on mainnet — at least one token has graduated, LP burned, ownership renounced, verifiable on the mainnet block explorer
- [ ] No P0 bugs surfaced in first 48 hours that required pausing the factory contract
