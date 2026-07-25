# Team Onboarding — Orba

Read this before touching anything. Each role has its own section. Find yours, do the steps in order, then ask the Lead (project owner) for your first task.

## The team

| Role | Who | Code access? |
|---|---|---|
| Lead (also codes) | You | Yes — full |
| Coder | 1 person | Yes — full, PR review by Lead |
| Social Media + Support | 1 person | No |
| Stress Tester A ("The Trader") | 1 person | No (testnet only) |
| Stress Tester B ("The Browser") | 1 person | No (testnet only) |

**Only the Lead and the Coder have code access.** Social/Support and Stress Testers do not touch the repo, contracts, infra, or deploy keys.

---

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

## Role: Lead (you)

You're the project owner AND hands-on-keyboard. You code alongside the Coder, but you also hold the keys, the merge button, and the final call.

### You own
- **Final merge approval to `main`** — every PR routes through you. No exceptions until mainnet ships.
- **Deployer key access** — only you execute mainnet deploys. The Coder writes deploy scripts; you run them.
- **`DECISION_LOG.md` updates** — every product/research decision gets logged as D29+.
- **Incident response on mainnet** — you're on call.
- **Roadmap calls and team coordination** — you decide what gets built and when.
- **Branch protection, CI, repo settings** — you manage these. No one else touches them.
- **Audit relationship** — you interface with the auditor; you triage findings.

### You also code (suggested split with Coder)
- **You**: contracts + mainnet redeploy + audit-fix review + indexer health + `packages/shared/src/index.ts`
- **Coder**: API + frontend + indexer feature work + bug fixes from stress testers
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

### What you protect
- **Deployer key** — never in code, commits, logs, or chat. Lead-only.
- **`packages/shared/src/index.ts`** — changing this breaks everything downstream. Only you edit it.
- **`contracts/src/BondingCurve.sol` curve math** — only with an audit finding backing the change.
- **Branch protection + CI** — don't let anyone disable these.
- **Mainnet gate** — no mainnet deploy until audit closes AND stress tests pass AND B32 (conservation of funds) passes.

---

## Role: Coder

You're the second developer. You have full code access across contracts, API, indexer, and frontend — but all merges route through the Lead, and the deployer key is Lead-only.

**Read `CODER_ONBOARDING.md` in full before writing any code.** That doc is your complete guide: repo map, Arc gotchas, day-1 commands, access/authority rules, workflow, files to read before editing, and mainnet rules. This section is a summary; the full doc is authoritative.

### You own
- Implementation work across contracts, API, indexer, frontend
- Writing (not executing) mainnet deploy scripts
- Applying audit fixes — every fix PR routes through Lead for review until mainnet ships
- Bug fixes reported by stress testers (from the playbook's findings log)
- Feature work assigned by the Lead

### You CANNOT (without explicit Lead sign-off, every time)
- Merge to `main` — all merges go through Lead's review
- Force-push or push directly to `main`
- Touch the deployer key or `DEPLOYER_PRIVATE_KEY`
- Deploy contracts to mainnet
- Modify `packages/shared/src/index.ts` (chain config, contract addresses)
- Modify `contracts/src/BondingCurve.sol` curve math without an audit finding
- Change branch protection, CI, or repo settings
- Modify `.env`, `.env.example`, or any secrets file
- Add, remove, or upgrade dependencies (supply-chain risk)
- Disable the RPC rotation, `/rpc` proxy whitelist, or indexer
- Run `e2e-graduation.js` without Lead sign-off (burns ~$9,000 USDC per run)

### Day-1 (summary — full version in `CODER_ONBOARDING.md`)
```bash
npm install
cp .env.example .env             # fill in values; ask Lead for RPC URLs (NOT deployer key)
node scripts/check-balance.js <your-wallet>
node scripts/e2e-full-flow.js    # must pass before starting work
forge test --root contracts
```

You need your own funded testnet wallet (get USDC at https://faucet.circle.com). Do NOT use the deployer wallet.

### Workflow
- Branch off `main`: `feat/<...>` or `fix/<...>`
- One branch per logical change
- PR to `main` — Lead reviews and merges
- Run relevant tests before opening a PR (contracts → `forge test`, API → `npm run build`, frontend → `npm run build`)
- If your change touches USDC math or display, double-check the formatter (3 formatters in `apps/web/src/lib/utils.ts` — using the wrong one is the #1 frontend bug)

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

## Role: Stress Tester A — "The Trader"

You act as a regular user testing the core trading flow. You open the site in a browser, connect a wallet, and click through the trading features: launch, buy, sell, watch graduation, trade on the AMM, and verify real-time updates. You are NOT probing contracts, databases, or backend infrastructure — you're clicking buttons and reporting what you see.

### You own
- Wallet connect + network switching
- Launching a token (form, image upload, 5 USDC fee, approval flow)
- Buying (quick amounts 10/50/100/500, custom amounts, slippage, approval flow, quotes, confirmations)
- Selling (token approval, quotes, slippage, confirmations)
- Watching graduation happen (buying until $25K MC, seeing the graduated state)
- Trading on the AMM after graduation
- Real-time updates (two tabs syncing, LiveTicker, PriceChart, TradeHistory)
- Transaction failure feedback (insufficient balance, no allowance, wrong network, slippage reverts)
- Rapid buying (UI handling fast clicks)
- Wrong network handling + disconnect/reconnect

### You do NOT own
- Testing every page (that's Tester B)
- Code fixes (route findings to the dev team via the playbook's reporting format)
- Anything on mainnet — testnet only, always

### Day-1 setup
1. Install a wallet browser extension (MetaMask, Rabby, or any EVM wallet)
2. Get testnet USDC at https://faucet.circle.com
3. Add Arc Testnet to your wallet (chain ID `5042002` — ask Lead for RPC URL)
4. Get the site URL from the Lead and open it in your browser
5. Open DevTools (F12) — Console + Network tabs

You need a funded testnet wallet. The graduation test (A7) needs more USDC — coordinate with the Lead for funding. Don't use the deployer wallet.

### Scenarios to run
**Read `STRESS_TEST_PLAYBOOK.md` — Tester A section (scenarios A1–A14).** Each scenario has steps, what to verify, and pass criteria. Use `STRESS_TEST_CHECKLIST.md` to tick off as you go.

### What to watch for
- Does the button work? Does the transaction confirm? Does the screen update?
- Are the values displayed reasonable? (not $0, not 1e6× too big)
- Do you get clear error messages when things fail? (not raw hex codes)
- Does the UI freeze or hang?
- Any red errors in the browser console (DevTools)?

---

## Role: Stress Tester B — "The Browser"

You act as a regular user testing every page and every navigation path. You open the site in a browser and click through every page, every link, every feature that isn't the core trading flow. Your job is to find broken pages, wrong values, missing features, and bad UX.

### You own
- Every page loads without errors (home, explore, launch, coin, leaderboard, watchlist, profile, agents, fees, docs, blog, legal)
- Auth flow (SIWE login/logout via Navbar)
- Favorites/watchlist (favorite button, watchlist page)
- Token chat (posting messages, seeing them appear)
- Profile page (holdings, trade history)
- Search (by name, symbol, address)
- Leaderboard
- USDC formatting on every page (the #1 bug source — values not showing as $0 or 1e6× too big)
- Mobile responsive (resize browser on every page)
- Error states (404 page, error page, invalid addresses)
- Browser shields/adblocker compatibility
- Multiple tabs/windows
- Navbar and footer links
- Token image display

### You do NOT own
- The core trading flow (that's Tester A)
- Code fixes (route findings via the playbook's reporting format)
- Anything on mainnet — testnet only

### Day-1 setup
1. Install a wallet browser extension (MetaMask, Rabby, or any EVM wallet)
2. Get testnet USDC at https://faucet.circle.com (small amount is fine — $10–50)
3. Add Arc Testnet to your wallet (chain ID `5042002` — ask Lead for RPC URL)
4. Get the site URL from the Lead and open it in your browser
5. Open DevTools (F12) — Console + Network tabs

### Scenarios to run
**Read `STRESS_TEST_PLAYBOOK.md` — Tester B section (scenarios B1–B23).** Each scenario has steps, what to verify, and pass criteria. Use `STRESS_TEST_CHECKLIST.md` to tick off as you go.

### What to watch for
- Does the page load? Is there anything broken or missing?
- Are values displayed reasonable? (not $0, not 1e6× too big — this is the #1 bug source)
- Do all links work? Does navigation make sense?
- Does it work on mobile? (resize your browser to ~375px)
- Any red errors in the browser console (DevTools)?
- Does it work with adblocker/shields enabled?

### Priority order if you're overwhelmed
1. **B19 (USDC formatting)** — the #1 bug source. If values show 1e6× too big or $0, users will be confused or misled.
2. **B4 (coin page layout)** + **B1 (home page)** — the pages users see most.
3. **B7 (auth)** + **B8 (favorites)** + **B9 (chat)** — features that require login.
4. **B18 (mobile)** — most memecoin users are on mobile.
5. Everything else — important but lower severity if they fail.

---

## Cross-team rules

- **Only Lead + Coder have code access.** Social/Support and Stress Testers do not touch the repo.
- **Stress testers act as regular users.** They open the site in a browser, connect a wallet, and click through everything. They do NOT probe contracts, databases, backend infrastructure, or run load tests. They report what they see as users.
- **All findings from stress testers go in `STRESS_TEST_PLAYBOOK.md` under "Findings log"** with repro steps, expected vs actual, and severity. Don't DM findings — write them down so they're not lost. Tick the corresponding box in `STRESS_TEST_CHECKLIST.md`.
- **All code changes go through PR review by the Lead** until mainnet ships. No direct pushes to `main`. The Coder opens PRs; the Lead merges.
- **Deployer key is Lead-only.** No one else executes mainnet deploys. The Coder writes deploy scripts; the Lead runs them.
- **Mainnet does not ship until:**
  - The audit closes
  - All Critical findings resolved
  - All High findings resolved or explicitly accepted by Lead
  - B19 (USDC formatting) passes on every page
  - Non-negotiable.
- **New decisions get logged in `DECISION_LOG.md`** as D29, D30, etc. — date, decision, rationale.
- **Stress testers use their own funded wallets, not the deployer wallet.** Coordinate funding with the Lead.
- **Graduation test (A7) needs more USDC — coordinate funding with the Lead before running.**
