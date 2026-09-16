# Coder Onboarding — Orba

Welcome. You're the second developer on a pump.fun-style memecoin launchpad on Arc (Circle's USDC-native L1). The Lead is the project owner. This doc gets you productive fast and spells out exactly what you can and can't do. Read it top to bottom before writing any code.

**Tl;dr — read these three files first, in order:**
1. `DECISION_LOG.md` — every research finding and product decision (D1–D28). This is the institutional memory. If you skip this, you'll re-litigate decisions already made and waste everyone's time.
2. `AGENTS.md` — project guide, commands, and the "Arc-specific gotchas" section. Non-negotiable.
3. `00_MASTER_PLAN.md` — what we're building and why.

Then prove your env works (see "Day 1" below). Then ask the Lead for your first ticket.

---

## 1. What this project is

A pump.fun-style launchpad on Arc. Users launch memecoins against a USDC-denominated bonding curve. When a token's curve hits a market-cap threshold ($25K), it "graduates" — liquidity migrates to a Uniswap V2 fork AMM, LP tokens are burned to `0x...dEaD`, and trading continues on the AMM.

Stack:
- **Contracts**: Solidity + Foundry (`contracts/`)
- **Backend**: NestJS + PostgreSQL + Redis (`apps/api/`)
- **Indexer**: Direct Arc RPC poller, polls `eth_getLogs` every 5s, runs inside the API process (`apps/api/src/indexer/arc-event-poller.service.ts`)
- **Frontend**: Next.js 15 + viem/wagmi (`apps/web/`)
- **Shared**: chain config, contract addresses, constants (`packages/shared/src/index.ts`)

Status: Phases 1–3 complete. E2E verified on testnet. Currently in audit + mainnet-prep phase.

---

## 2. Repo map (where things live)

```
contracts/
  src/
    BondingCurve.sol        # THE core contract. Curve math, buy/sell/launch. Read twice before touching.
    TokenFactory.sol        # launches new tokens + curves
    MemeToken.sol           # ERC-20 with 4% max-wallet enforcement
    LiquidityMigration.sol  # graduation: curve → AMM, LP burn to 0x...dEaD
    AMMFactory.sol          # Uniswap V2 fork factory
    AMMPair.sol             # Uniswap V2 fork pair
    Treasury.sol            # protocol + creator fee accumulation
    SafeUSDC.sol            # low-level USDC calls (Arc's transferFrom returns void — see D22)
  test/
    BondingCurve.t.sol      # Tier 1 — local, fast
    ArcIntegration.t.sol    # Tier 2 — Arc fork, slower, uses MockUSDC
apps/api/src/
  indexer/                  # ArcEventPollerService (default), envio-poller.service.ts (disabled fallback)
  rpc/rpc.controller.ts     # same-origin JSON-RPC read proxy, 4-provider rotation
  tokens/                   # token + trade endpoints
  websocket/                # WS push to frontend
  leaderboard/, favorites/, messages/, token-metadata/, upload/, users/, auth/, database/, redis/
apps/web/src/
  app/                      # Next.js routes (6 pages)
  components/               # React components (TradePanel, Navbar, etc.)
  lib/
    config.ts               # wagmi config, fallback transport, chainId pinning
    utils.ts                # USDC formatters — READ THE HEADER, using the wrong one is the #1 frontend bug
    use-arc-receipt.ts      # fallback receipt poller, rotates providers
packages/shared/src/index.ts # Arc chain config, contract addresses, constants — changing this breaks everything downstream
scripts/
  e2e-full-flow.js          # launch → buy → sell (~30s)
  e2e-graduation.js         # graduation flow — needs ~$9000 USDC, ask Lead before running
  e2e-trade-test.js         # buy + sell on existing token
  e2e-sell-test.js          # sell only
  check-balance.js          # verify wallet USDC balance
  bonding-curve-model.js    # off-chain curve model — on-chain results should match this
```

---

## 3. Arc gotchas that WILL bite you

Read `AGENTS.md` "Arc-specific gotchas" in full. The ones that cause the most bugs:

- **USDC is dual-decimal on Arc**: 18-dec native (gas token), 6-dec ERC-20 (everything else). Same asset. Use 6-dec everywhere except gas math. Never mix. Getting this wrong makes values display off by 1e6× or 1e12×.
- **`transferFrom` returns void on Arc USDC** (non-standard EVM behavior). We use the `SafeUSDC` library with low-level calls. Never use IERC20's `transferFrom` return value directly. See D22.
- **Arc precompiles (`0x1800...0000`, `0x1800...0001`) don't exist in anvil fork mode.** Tier 2 tests use `MockUSDC`. Real runtime is validated on testnet only. See D23.
- **Block time ~0.5s, deterministic finality, no reorgs.** Don't write reorg-handling code.
- **No on-chain DEX on Arc** — we deploy our own Uniswap V2 fork for graduation.
- **anvil can't reproduce Arc behavior** — integration tests must hit Arc testnet RPC.
- **LP burn to `0x...dEaD`**, not `address(0)` (Arc's zero-address rules). See D8.
- **RPC rate limits are aggressive**: `rpc.testnet.arc.io` returns `-32011 request limit reached`. We rotate 4 providers (Circle, dRPC, QuickNode, Blockdaemon). Three rotation layers — see `AGENTS.md`.
- **Mainnet chain ID is `5042`** (testnet is `5042002`). Mainnet is public since
  2026-09-16: `https://rpc.mainnet.arc.io`, `https://rpc.drpc.mainnet.arc.io`,
  `https://rpc.quicknode.mainnet.arc.io`, `https://rpc.blockdaemon.mainnet.arc.io`
  — all open, no API key.
- **Blocklisted test address**: `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` (see D5).

### The three USDC formatters (frontend — easy to get wrong)
In `apps/web/src/lib/utils.ts`:
- `formatUsdc(x)` — divides by 1e6. For micro-USDC DB fields: `real_usdc`, `creator_fees_accrued`, `protocol_fees_accrued`, `usdc_amount`, `total_volume_usdc`.
- `formatUsdDirect(x)` — no division. For values already in dollars: `market_cap`, `volume_24h`, `CREATION_FEE`.
- `formatNativeUsdc(x)` — divides by 1e18. For Arc native balance from `useBalance` (18-dec native USDC).
- `formatTokens(x)` — divides by 1e18. For 18-dec token amounts.
- `formatPrice(x)` — no division. For `price` (already USDC-per-token in dollars).

Using the wrong one is the most common frontend bug. If a value looks off by 1e6× or 1e12×, you used the wrong formatter.

---

## 4. Day 1 — get your env working

```bash
# 1. Install deps
npm install

# 2. Copy env template and fill in values (ask Lead for RPC URLs; do NOT ask for the deployer key)
cp .env.example .env

# 3. Verify RPC + your wallet reachable
node scripts/check-balance.js <your-wallet-address>

# 4. Run the full E2E flow on testnet (~30s). Must pass before you start work.
node scripts/e2e-full-flow.js

# 5. Run the contract test suite
forge test --root contracts                              # all tests
forge test --root contracts --match-contract BondingCurveTest   # Tier 1 only, fast

# 6. Start the local stack
docker compose up -d                                     # Postgres + Redis
cd apps/api && npm run dev                               # API + indexer on :4000
cd apps/web && npm run dev                               # frontend on :3000
```

If `e2e-full-flow.js` fails, **do not start work — fix your env first.** Common causes: missing `DEPLOYER_PRIVATE_KEY` (ask Lead how to get a test wallet funded — do NOT use the Lead's deployer wallet), no testnet USDC (get it at https://faucet.circle.com).

You need your own funded testnet wallet for development. Get USDC at https://faucet.circle.com. Do not use the deployer wallet for your own testing.

---

## 5. Your access and authority — read this carefully

This section exists because the project holds real USDC and is heading to mainnet. It's standard practice for a lead + 1 setup, not a trust issue. Follow it and you'll have full freedom to ship; the guardrails are around the things that can cause irreversible harm.

### You CAN
- Create feature branches off `main`
- Open PRs against `main`
- Work on any part of the codebase: contracts, API, indexer, frontend, scripts
- Run any test on testnet
- Run `e2e-full-flow.js`, `e2e-trade-test.js`, `e2e-sell-test.js` freely
- Propose new decisions (log them in `DECISION_LOG.md` as D29+, with rationale)
- Add dependencies to `apps/api` or `apps/web` **with Lead approval per package** (supply-chain risk — new packages need a review)

### you CANNOT (without explicit Lead sign-off, every time)
- **Merge to `main`.** All merges go through the Lead's review. No exceptions, no "it's just a small fix." Open a PR.
- **Force-push to `main`** or rewrite git history on `main`.
- **Push directly to `main`** — branch protection will block this, but don't try.
- **Touch the deployer key or `DEPLOYER_PRIVATE_KEY`.** That's Lead-only. You write deploy scripts; the Lead executes them. Never put a private key in code, a commit, a log, or a chat message.
- **Deploy contracts to mainnet.** Mainnet deploys are Lead-only, after audit sign-off.
- **Modify `packages/shared/src/index.ts`** (chain config, contract addresses) without Lead review — changing this breaks everything downstream.
- **Modify `contracts/src/BondingCurve.sol` curve math** without an audit finding or explicit Lead request backing the change.
- **Change branch protection, CI, or repo settings.** These are Lead-managed.
- **Modify `.env`, `.env.example`, or any secrets file.** Propose changes via PR; Lead applies.
- **Add, remove, or upgrade dependencies** without Lead approval (supply-chain + version-pin policy in `AGENTS.md`).
- **Disable or weaken the RPC rate-limit rotation, the `/rpc` proxy whitelist, or the indexer.** These are load-bearing reliability features.
- **Run `e2e-graduation.js` without asking the Lead first** — it burns ~$9000 USDC per run.

### If you're unsure whether something needs sign-off
Ask. It's faster than reverting. The rule of thumb: if the change affects mainnet, money, keys, dependencies, or shared config — ask first.

---

## 6. Workflow

### Branching
- Branch off `main`: `git checkout -b feat/<short-description>` or `fix/<...>`
- One branch per logical change. Don't stack unrelated changes in one PR.
- Keep branches short-lived (days, not weeks). Rebase onto `main` before opening a PR.

### PRs
- Every change to `main` goes through a PR. No direct commits.
- PR title: `feat: ...`, `fix: ...`, `chore: ...`, `docs: ...`, `test: ...`
- PR body: what changed, why, how to verify, any risk to mainnet/funds.
- The Lead reviews and merges. Don't merge your own PRs.
- If the Lead asks for changes, push to the same branch — don't open a new PR.

### Before opening a PR
- Run the relevant tests:
  - Contracts changed → `forge test --root contracts`
  - API changed → `cd apps/api && npm run build`
  - Frontend changed → `cd apps/web && npm run build`
- If your change touches USDC math or display, double-check the formatter (section 3).
- If your change touches the indexer or RPC proxy, run `e2e-full-flow.js` to confirm the pipeline still works.
- Don't commit secrets, `.env` files, or build artifacts (`out/`, `dist/`, `node_modules/`).

### Commit messages
Focus on "why" not "what." Match the existing style in the repo. Example:
```
fix: use SafeUSDC for transferFrom in LiquidityMigration

Arc's transferFrom returns void (D22); the IERC20 return-value check
was reverting valid graduations. Switched to SafeUSDC low-level call.
```

---

## 7. Files to read end-to-end before editing them

Don't edit a file the first time without reading the whole thing first.

| If you're touching... | Read these first |
|---|---|
| Curve math / buy / sell | `contracts/src/BondingCurve.sol`, `scripts/bonding-curve-model.js`, D20 |
| Graduation / AMM | `contracts/src/LiquidityMigration.sol`, `contracts/src/AMMPair.sol`, D6, D7, D8 |
| Fees | `contracts/src/Treasury.sol`, D19 |
| USDC transfers | `contracts/src/SafeUSDC.sol`, D22 |
| Indexer | `apps/api/src/indexer/arc-event-poller.service.ts`, D27 |
| RPC proxy | `apps/api/src/rpc/rpc.controller.ts`, `AGENTS.md` "RPC rate limits" |
| Frontend reads | `apps/web/src/lib/config.ts`, `apps/web/src/lib/use-arc-receipt.ts` |
| Frontend display | `apps/web/src/lib/utils.ts` (the formatters — section 3) |
| Chain config / addresses | `packages/shared/src/index.ts` (and ask Lead before changing) |

---

## 8. How decisions get logged

Every product or research decision gets a new entry in `DECISION_LOG.md` as `### D<n>. <title>` (next number after the last one — currently D28). Format:
```
### D29. <short title>
Date: YYYY-MM-DD
Status: Confirmed / Proposed / Superseded by D<n>

<context — why this came up>
<decision — what we decided>
<rationale — why>
<implications — what this affects>
```

If you make a decision during implementation, log it. If you're unsure whether something is a decision worth logging, ask the Lead. The log is how the next person (or future you) understands why the code is the way it is.

---

## 9. Mainnet rules (critical)

- **Mainnet does not ship until the audit closes AND user testing passes AND B19 (USDC formatting on every page) passes.** Non-negotiable.
- Mainnet chain ID is `5042` (testnet is `5042002`).
- Mainnet requires private/paid RPC endpoints — there are no public ones yet.
- Mainnet deploy is Lead-only. You write the scripts; the Lead executes.
- Any contract change after the audit closes re-opens the audit window. Don't sneak contract changes in post-audit.

---

## 10. Working with the user testers

Two testers act as regular users — they open the site in a browser, connect a wallet, and click through everything. They are NOT probing contracts, databases, or backend infrastructure. Their findings become your tickets.

- **Tester A ("The Trader")** — tests the core trading flow: launch, buy, sell, graduation, AMM, real-time updates
- **Tester B ("The Browser")** — tests every page, auth, favorites, chat, profile, search, USDC formatting, mobile, error states

### How findings reach you
1. Testers log findings in `STRESS_TEST_PLAYBOOK.md` under "Findings log" (format: F1, F2, ... with repro, expected/actual, severity, status)
2. They tick boxes in `STRESS_TEST_CHECKLIST.md` as they go
3. The Lead triages findings and assigns them to you as tickets
4. You fix in a branch, open a PR, Lead reviews and merges
5. You update the finding's status to "Fixed" in the playbook

### Severity = your priority
- **Critical** (user loses funds, tx succeeds but user gets nothing, can't use core features): drop everything, fix immediately, mainnet blocked until resolved
- **High** (core feature broken — can't buy/sell/launch, wrong values that could mislead a user into a bad trade): fix before mainnet
- **Medium** (feature partially broken, confusing error, real-time updates lag but recover): fix before mainnet if possible, else ack and schedule
- **Low** (cosmetic, typo, minor layout, edge case most users won't hit): fix when you can

### When you pick up a finding
1. Read the finding in `STRESS_TEST_PLAYBOOK.md` — full repro, expected vs actual
2. **Reproduce it yourself in the browser** before starting the fix — don't trust the report blindly. The testers are users, not devs; their repro steps are user-perspective, not code-perspective.
3. Once reproduced, trace it to the code: open DevTools, check the Network tab for failed requests, check the Console for errors, then find the relevant component in `apps/web/src/` or endpoint in `apps/api/src/`
4. Fix in a branch: `fix/F<n>-<short-description>`
5. Test: reproduce the original scenario in the browser — verify the fix works. If the finding touches USDC display, double-check the formatter (3 formatters in `apps/web/src/lib/utils.ts` — using the wrong one is the #1 frontend bug).
6. PR with the finding ID in the title: `fix: F3 — market cap shows $4B instead of $4K on home page`
7. After merge, update the finding's status to "Fixed" in the playbook

### The #1 bug source: USDC formatting
Most findings from Tester B will be values displaying wrong — usually 1,000,000× or 1,000,000,000,000× too big, or showing $0 when they shouldn't. This happens when the frontend uses the wrong formatter. Before you start fixing:
- `formatUsdc(x)` — divides by 1e6. For micro-USDC DB fields: `real_usdc`, `creator_fees_accrued`, `protocol_fees_accrued`, `usdc_amount`, `total_volume_usdc`.
- `formatUsdDirect(x)` — no division. For values already in dollars: `market_cap`, `volume_24h`, `CREATION_FEE`.
- `formatNativeUsdc(x)` — divides by 1e18. For Arc native balance from `useBalance` (18-dec native USDC).
- `formatTokens(x)` — divides by 1e18. For 18-dec token amounts.
- `formatPrice(x)` — no division. For `price` (already USDC-per-token in dollars).

If a value is 1e6× too big, the wrong formatter was used (e.g., `formatUsdc` on a value that's already in dollars, or `formatUsdDirect` on a micro-USDC value). Check the field's unit in the DB schema (`AGENTS.md` "Database notes") and match the formatter.

### Don't dismiss findings without reproducing
If a tester reports something that "can't be right," reproduce it in the browser anyway. Arc has non-standard behavior (D22, D23) and the frontend has subtle RPC fallback logic that has caused real surprises. If you can't reproduce, say so in the finding's status with your repro steps — the tester may have hit a browser-specific issue (adblocker, shields, wallet extension) you didn't.

---

## 11. When you're blocked

- **Env / RPC issues**: check `.env.example` for the right values; check `AGENTS.md` "RPC rate limits."
- **Arc-specific weirdness**: search `DECISION_LOG.md` — it's probably documented as a D-entry.
- **"Why does this code look weird?"**: there's almost always a D-entry explaining it. Search before "fixing" it.
- **Anything involving money, keys, mainnet, or shared config**: ask the Lead. Don't guess.

Welcome aboard. Read the three files, get your env working, and ask the Lead for your first ticket.
