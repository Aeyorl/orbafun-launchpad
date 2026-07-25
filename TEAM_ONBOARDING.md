# Team Onboarding — Orba

Read this before touching anything. Each role has its own section. Find yours, do the steps in order, then ask the Lead (project owner) for your first task.

## Read these first (everyone, no exceptions)

In this order:

1. `DECISION_LOG.md` — every research finding and product decision (D1–D28). This is the institutional memory. If you make a new decision, log it here as D29+.
2. `AGENTS.md` — project guide, commands, and the "Arc-specific gotchas" section. The gotchas will bite you if you skip them.
3. `00_MASTER_PLAN.md` — what we're building and why (pump.fun-style launchpad on Arc, USDC-native L1).

Then prove your environment works:

```bash
npm install
node scripts/check-balance.js <your-wallet-address>   # confirms RPC + your wallet reachable
node scripts/e2e-full-flow.js                          # full launch → buy → sell on testnet (~30s)
```

If `e2e-full-flow.js` fails, do not start work. Fix your env first (see `.env.example`). Common cause: missing `DEPLOYER_PRIVATE_KEY` or no testnet USDC (get it at https://faucet.circle.com).

## Arc gotchas that will bite you (everyone)

- **USDC is dual-decimal on Arc**: 18-dec native (gas), 6-dec ERC-20 (everything else). Never mix. Use 6-dec everywhere except gas math.
- **`transferFrom` returns void on Arc USDC** (non-standard). We use the `SafeUSDC` library (low-level call). See D22.
- **Arc precompiles don't exist in anvil fork mode** — Tier 2 tests use `MockUSDC`. Real runtime is validated on testnet only. See D23.
- **Block time ~0.5s, deterministic finality, no reorgs.** Don't write reorg-handling code.
- **RPC rate limits are real**: `rpc.testnet.arc.io` returns `-32011 request limit reached` aggressively. We rotate 4 providers (Circle, dRPC, QuickNode, Blockdaemon). Three layers of rotation — see `AGENTS.md`.
- **Mainnet chain ID is `5042`** (testnet is `5042002`). Mainnet has no public RPC yet — needs private/paid endpoints.

---

## Role: Lead / Coder (you + 1 coder)

You and one other dev share this role. Split work by area, not by ticket — see "Division of labor" below.

### You own
- Final merge approval to `main`
- Deployer key access (only you execute mainnet deploys; the other coder writes scripts, you run them)
- `DECISION_LOG.md` updates — every product/research decision gets logged
- Incident response on mainnet
- Roadmap calls and team coordination

### The other coder owns
- Implementation work across contracts, API, indexer, frontend
- Writing (not executing) mainnet deploy scripts
- Applying audit fixes — but every fix PR routes through you for review until mainnet ships

### Division of labor (suggested)
- **You**: contracts + mainnet redeploy + audit-fix review + indexer health
- **Other coder**: API + frontend + indexer feature work + bug fixes from stress testers
- Swap as needed, but keep one person per file at a time to avoid merge conflicts.

### Day-1 commands
```bash
forge test --root contracts                              # all tests (Tier 1 + Tier 2 Arc fork)
forge test --root contracts --match-contract BondingCurveTest   # Tier 1 only, fast
docker compose up -d                                     # Postgres + Redis
cd apps/api && npm run dev                               # API + indexer on :4000
cd apps/web && npm run dev                               # frontend on :3000
```

### Files to read end-to-end before editing
- `contracts/src/BondingCurve.sol` — the core. ~600 lines. Read it twice.
- `contracts/src/SafeUSDC.sol` — why it exists (D22).
- `contracts/src/LiquidityMigration.sol` — graduation flow, LP burn to 0x...dEaD.
- `apps/api/src/indexer/arc-event-poller.service.ts` — direct RPC poller, 5s interval.
- `apps/api/src/rpc/rpc.controller.ts` — same-origin read proxy, 4-provider rotation.
- `apps/web/src/lib/config.ts` — wagmi fallback transport, chainId pinning.
- `apps/web/src/lib/utils.ts` — the THREE USDC formatters. Using the wrong one is the #1 frontend bug. Read the header comment.

### What you do NOT touch without Lead sign-off
- `packages/shared/src/index.ts` (chain config, contract addresses) — changing this breaks everything downstream
- `contracts/src/BondingCurve.sol` curve math — only with an audit finding backing the change
- Deployer key usage on mainnet

---

## Role: Social Media + Support

You are the public voice of the project. You do not touch code, contracts, infra, or deploy keys.

### You own
- Twitter/X presence
- Discord server (setup, moderation, FAQ)
- Support inbox — user questions, "my buy didn't confirm", "balance shows $0"
- Announcements (testnet live, audit complete, mainnet live, etc.) — **drafts go to Lead for sign-off before posting**
- Capturing recurring user issues and feeding them back to the dev team weekly

### You do NOT own
- Posting "mainnet is live" before the Lead confirms the deploy is verified
- Promising timelines for audit fixes or mainnet
- Sharing deployer wallet addresses, RPC URLs, or any infra detail publicly
- Responding to security reports in public — route any "I found a bug" DM to the Lead immediately and privately

### Day-1 reading
1. `DECISION_LOG.md` D9 (competitor analysis), D19 (creator fee model), D28 (product decisions) — so you actually understand what you're talking about
2. `AGENTS.md` "Arc-specific gotchas" — so you can answer "why does my balance show $0" (answer: browser shields blocking cross-origin RPC; tell them to disable shields for the site or use the same-origin proxy)
3. `00_MASTER_PLAN.md` — anti-rug mechanics, so you can explain them

### Common support answers to have ready
- **"My balance shows $0"** → browser shields/adblocker blocking cross-origin RPC. Disable shields for the site. The app routes through a same-origin proxy first, but shields can still interfere.
- **"My buy didn't confirm"** → Arc block time is ~0.5s, should confirm in seconds. If stuck >30s, check the receipt poller logs in browser console for `[arc-receipt]` warnings. Tell user to refresh.
- **"How do I get testnet USDC"** → https://faucet.circle.com
- **"Is this on mainnet"** → not yet; we're in testnet + audit phase. Do not give a date.

### Escalation rules
- Any message mentioning "bug", "exploit", "vulnerability", "lost funds", "drained" → DM the Lead immediately, do not reply publicly
- Any request for deployer keys, RPC URLs, contract source before public release → ignore and tell Lead
- Any mainnet-timeline question → "we'll announce when it's ready, no date yet"

---

## Role: Stress Tester A — Load / Scale

You hammer the platform at volume. Your job is to find where it breaks under load, not to find logic bugs (that's Tester B).

### You own
- API throughput testing (REST + WebSocket)
- WebSocket connection limits and message delivery under load
- Indexer lag measurement under event volume
- RPC rate-limit exhaustion testing (the 4-provider rotation)
- Database write contention under concurrent buys/sells

### You do NOT own
- Logic/financial-correctness bugs (Tester B)
- Code fixes (route findings to the dev team via the playbook's reporting format)
- Anything on mainnet — testnet only, always

### Day-1 setup
```bash
npm install
node scripts/e2e-full-flow.js                  # learn the happy path first
node scripts/e2e-trade-test.js                 # buy + sell on existing token
```
You'll need 2–3 funded testnet wallets (get USDC at https://faucet.circle.com). Coordinate with the Lead on wallet funding — don't drain the deployer wallet.

### Scenarios to run
See `STRESS_TEST_PLAYBOOK.md` — Tester A section. Start there, then go off-script once you've covered the listed scenarios.

### Tools you'll likely need
- `artillery` or `k6` for HTTP load against the API
- A custom WebSocket client (the repo doesn't ship one) — write one in Node, ping the Lead before adding it to the repo
- Multiple funded wallets running `e2e-trade-test.js` in parallel shells

### What to monitor while testing
- API response times (p50, p95, p99)
- WebSocket message latency (event emitted on-chain → received by client)
- Indexer lag: `indexer_sync_state` table, entity `ArcEventPoller` — compare `last_processed_block` to current block
- RPC error rate: watch for `-32011 request limit reached` in API logs
- Postgres: `pg_stat_activity` for connection saturation, lock waits

---

## Role: Stress Tester B — Edge Cases / Financial Correctness

You find logic bugs at the boundaries. Your job is to find where the math breaks or where state transitions go wrong, not to find load issues (that's Tester A).

### You own
- Graduation threshold boundary (what happens at exactly $25K MC, just under, just over)
- 4% max-wallet limit enforcement (under, at, over)
- Sell-when-illiquid scenarios
- Fee split math verification (creator fee, protocol fee, curve)
- Rapid buy → sell → buy races on the same curve
- Reentrancy-ish patterns (even if guarded, verify)
- What happens when a USDC transfer fails mid-curve

### You do NOT own
- Load/scale testing (Tester A)
- Code fixes (route findings via the playbook's reporting format)
- Anything on mainnet — testnet only

### Day-1 setup
```bash
npm install
node scripts/e2e-full-flow.js                          # happy path
node scripts/e2e-graduation.js                         # graduation flow — needs ~$9000 USDC, coordinate with Lead
node scripts/e2e-sell-test.js <curve> <amount>         # sell only, on an existing token
node scripts/bonding-curve-model.js                    # understand the curve math before testing it
```

### Scenarios to run
See `STRESS_TEST_PLAYBOOK.md` — Tester B section. The graduation test is expensive (real USDC); coordinate funding with the Lead before running it repeatedly.

### What to verify on every scenario
- On-chain state matches DB state after the indexer catches up (compare `contracts/src/BondingCurve.sol` view outputs to `apps/api` DB rows)
- Fee splits sum to exactly the expected total (no dust loss, no overflow)
- Token balances across all participants + curve + AMM (post-graduation) sum to total supply
- No revert that the frontend doesn't surface to the user

### Files to read before testing
- `contracts/src/BondingCurve.sol` — the curve math and state transitions
- `contracts/src/LiquidityMigration.sol` — graduation + LP burn
- `contracts/src/Treasury.sol` — fee accumulation
- `scripts/bonding-curve-model.js` — the off-chain model; your on-chain results should match this
- `DECISION_LOG.md` D20 (curve parameters locked in), D19 (fee model)

---

## Cross-team rules

- **All findings from stress testers go in `STRESS_TEST_PLAYBOOK.md` under "Findings log"** with repro steps, expected vs actual, and severity. Don't DM findings — write them down so they're not lost.
- **All code changes go through PR review by the Lead** until mainnet ships. No direct pushes to `main`.
- **Deployer key is Lead-only.** No one else executes mainnet deploys.
- **Mainnet does not ship until the audit closes and stress tests pass.** Non-negotiable.
- **New decisions get logged in `DECISION_LOG.md`** as D29, D30, etc. — date, decision, rationale.
