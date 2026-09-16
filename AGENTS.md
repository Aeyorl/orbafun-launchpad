# Orba — Project Guide

## What this is
A pump.fun-style memecoin launchpad on Arc (Circle's USDC-native L1 blockchain).
Users launch tokens against a bonding curve denominated in USDC; tokens graduate
to an AMM when the curve reaches a threshold.

## Build status
Phase 1 (Smart Contracts) — complete. 33/33 tests pass (26 original + 7 AMMRouter), deployed to Arc testnet.
Phase 2 (Backend + Indexer) — complete. API + indexer + WebSocket pipeline verified.
Phase 3 (Frontend) — complete. Next.js 15 app builds, all 6 pages serve, API integration live.
Direct Arc RPC Poller — complete. Replaced Envio HyperIndex with a lightweight
  `ArcEventPollerService` that polls Arc RPC directly via `eth_getLogs` every 5s.
  No Docker/WSL/Hasura dependency. Indexes launch/buy/sell events in ~5s.
  Envio code remains in `apps/api/src/indexer/envio-poller.service.ts` as a
  disabled fallback (off when `INDEXER_GRAPHQL_URL` is unset).
RPC read proxy — complete. `POST /rpc` on the API forwards whitelisted read
  methods (eth_blockNumber, eth_getLogs, eth_call, eth_getTransactionReceipt,
  etc.) to Arc RPC providers with server-side rotation. The frontend routes
  all wagmi reads through this same-origin proxy first (immune to browser
  shields/adblockers), falling back to direct provider URLs. Write methods
  (eth_sendRawTransaction, etc.) are rejected with 403 — transactions are
  signed and broadcast by the user's wallet only. See
  `apps/api/src/rpc/rpc.controller.ts` and `apps/web/src/lib/config.ts`.
E2E flow — verified. Launch → buy → sell completes in ~30s end-to-end
  (tx confirmations ~1s each, indexer lag ~5s). Run `node scripts/e2e-full-flow.js`.
AI Agent-Launched Tokens (MVP) — complete. Agents can register, authenticate
  via API keys, and launch tokens through a platform-funded deployer wallet.
  - `POST /agents/register` — register agent, get API key (admin auth via AdminGuard)
  - `POST /agents/launch` — launch token (agent auth via `x-api-key` header)
  - `GET /agents` — list all active agents with stats (public, paginated)
  - `GET /agents/me` — authenticated agent's profile + stats
  - `GET /agents/me/launches` — authenticated agent's launch history
  - `GET /agents/me/trades` — authenticated agent's trade history
  - `GET /agents/:agentId` — public agent profile
  - `GET /agents/:agentId/launches` — public agent's launched tokens
  - `GET /agents/deployer/balance` — deployer wallet USDC balance (admin auth)
  - `POST /agents/deployer/approve` — one-time USDC approval for TokenFactory (admin auth)
  Marketplace — templates (admin auth for create/deploy, public for list/get):
  - `GET /agents/templates` — list templates (public, paginated, filter by category)
  - `GET /agents/templates/:id` — template details (public)
  - `POST /agents/templates` — create template (admin auth)
  - `POST /agents/templates/:id/deploy` — deploy agent from template (admin auth)
  Marketplace — leaderboard (public):
  - `GET /agents/leaderboard` — top agents by metric (launches, volume, or tips)
  Marketplace — tips (wallet auth for tip, public for list):
  - `POST /agents/:agentId/tip` — send USDC tip to an agent (wallet auth)
  - `GET /agents/:agentId/tips` — list tips received by an agent (public)
  Token management (agent auth required, ownership verified for messages/metadata):
  - `POST /agents/tokens/:address/messages` — post chat message on agent's token
  - `POST /agents/tokens/:address/metadata` — update metadata on agent's token
  - `POST /agents/tokens/:address/buy` — buy tokens via deployer wallet (any token)
  - `POST /agents/tokens/:address/sell` — sell tokens via deployer wallet (any token)
  Admin auth: AdminGuard checks wallet signature + ADMIN_WALLETS allowlist (env).
  Frontend: /agents browse page + /agents/:agentId profile page with launches.
  Deployer wallet pays gas per launch (creation fee is 0 — launching is free). Spending limits
  (daily/monthly) enforced per agent, including buy trades. See `apps/api/src/agents/`.
Phase 4 (Testing & Security) — self-audit complete (2 rounds), load test passed.
  Security audit: 2 rounds of deep audit across contracts, API, and frontend.
    Round 1: ReentrancyGuard on BondingCurve, tip replay prevention (UNIQUE on
      tx_hash), spending limit race condition (SELECT FOR UPDATE), BigInt
      validation (safeBigInt), deployer balance pre-flight check, multer upgrade,
      self-tipping prevention, auth verify rate limiting, launch double-submit guard.
    Round 2: Tip double-counting fix (tx_hash globally unique, not per-agent),
      template BigInt validation, indexer webhook constant-time secret comparison,
      favorites GET endpoints auth-guarded.
  Load test: `node scripts/load-test-buys.js <curve> [concurrency] [usdc-per-buy]`
    Results on Arc testnet (2026-07-25):
    - 3 concurrent buys, 1 USDC each:  3/3 success, 0.34 txs/s, indexer lag 7.9s
    - 10 concurrent buys, 2 USDC each: 10/10 success, 1.03 txs/s, indexer lag 18.5s
    - 25 concurrent buys, 2 USDC each: 25/25 success, 2.36 txs/s, indexer lag 51.6s
    No contract reverts, no reentrancy issues, on-chain state consistent at all
    concurrency levels. Indexer lag scales linearly with trade count (5s poll
    interval is the bottleneck). Remaining: external audit (required for mainnet),
    anti-rug manual verification on arcscan, AMM swap contention test post-graduation.
  Graduation + anti-rug test: `node scripts/load-test-graduation.js`
    Uses TestTokenFactory + TestBondingCurve (low $4,150 graduation threshold
    instead of production $25,000) to test the full graduation flow for ~$130
    instead of ~$9,000. Test contracts in `contracts/src/test/`.
    Results on Arc testnet (2026-07-25):
    - Token launched, $120 buy pushed MC from $4,000 to $4,163.64
    - Migration succeeded (checkAndMigrate)
    - Anti-rug checks: 6/6 PASS
      ✓ AMM pair created with liquidity (118.8 USDC / 120M tokens)
      ✓ LP tokens burned to 0x...dEaD (100.00%)
      ✓ Token ownership renounced (owner is zero address)
      ✓ Token marked as graduated (graduated == true)
      ✓ Token bondingCurve zeroed (max-wallet + cooldown disabled)
      ✓ Curve marked as graduated (graduated == true)
    Deployed test contracts:
      - TestTokenFactory: 0x50367af1b46c18a68f14124d154ec171959a9cef
      - LiquidityMigration: 0xcb67439f13452bffc298f748bfed3d63efa06266
      - Graduated token: 0x4b1f5267604a97ccc9b9701ddfb6f0174ed47f97
      - AMM pair: 0x6FC25AC50849cbaF93D0a5a1218050003E7f8168
  AMM swap test: `node scripts/load-test-amm-swaps-simple.js [num-swaps=5] [usdc-per-swap=1]`
    Sequential buy+sell swaps on the graduated token's AMM pair.
    Results on Arc testnet (2026-07-25):
    - 5 buy swaps (1 USDC → tokens): 5/5 success
    - 5 sell swaps (tokens → 1 USDC): 5/5 success
    - Constant-product invariant: PASS (k increased by 0.000002% from rounding)
    NOTE: This AMM has 0% fee (not Uniswap V2's 0.3%) — the swap function
    takes 3 args (no `data` param for flash swaps). Output formula:
    amountOut = (amountIn * reserveOut) / (reserveIn + amountIn)
  AMM concurrent swap test: `node scripts/load-test-amm-swaps.js [concurrency=6] [usdc-per-swap=1]`
    Concurrent buy+sell swaps on the AMM pair. EXPECTED TO FAIL — this is
    correct Uniswap V2 behavior, not a bug.
    Results on Arc testnet (2026-07-25):
    - 6 concurrent swappers: 1/6 success, 5/6 reverted with "AMM: K"
    - k invariant: PASS (increased 4.06% — the 1 successful swap consumed
      all 6 transfers' worth of price impact)
    WHY IT FAILS: The AMM uses the "transfer-then-swap" pattern. All 6 swappers
    transfer input tokens first, then call swap() serially (nonReentrant).
    Swap #1 sees ALL 6 transfers' extra tokens, succeeds, and updates reserves.
    Swap #2 reads the UPDATED reserves but calculated its output from OLD
    reserves — the invariant check fails because it's "double-spending" price
    impact. This is exactly how Uniswap V2 works without a router.
    FIX: Build an AMMRouter contract (swapExactUsdcForTokens / swapExactTokensForUsdc)
    that does transferFrom + swap atomically in one tx. Phase 5 item — not needed
    for testnet launch since the bonding curve (not the AMM) is the primary
    trading venue. The AMM is only used post-graduation.
  Heavy buy test: `node scripts/load-test-heavy-buy.js <curve> [usdc-amount=20]`
    Single large buy on the production bonding curve.
    Results on Arc testnet (2026-07-25):
    - $20 USDC buy: 4.8M tokens, MC $4,103 → $4,131, 9.73s tx time
    - realUsdc increased by 19.8 USDC (1% fee correctly deducted)
    - Indexer lag: 2.6s
    - On-chain state: consistent
Phase 5 (Optional Features) — 4 features built, smoke-tested, shipped.
  Leaderboard page UI — complete. New Next.js page at `/leaderboard` with 3
    tabs (Top Gainers / Top Volume / Top Creators). Backend API already existed
    at `GET /leaderboard?type=...`. Added "Leaders" link to Navbar (desktop +
    mobile). File: `apps/web/src/app/leaderboard/page.tsx`.
  Enhanced Share cards — complete. New `ShareButton` component on the coin
    page header (next to FavoriteButton). Dropdown with Copy link / native
    Share (mobile) / Post on X (Twitter intent). OG image infra already
    renders rich 1200x630 preview cards (token name, MC, bonding curve
    progress) via `apps/web/src/app/coin/[address]/opengraph-image.tsx`.
    Fixed stale "Arc.fun" branding in OG image → "Orba".
    Files: `apps/web/src/components/ShareButton.tsx`,
    `apps/web/src/app/coin/[address]/page.tsx`.
  AMMRouter contract — complete. Fixes the concurrent "AMM: K" swap bug
    documented in the Phase 4 AMM concurrent swap test above. The router does
    `transferFrom` + `swap` atomically in one tx, so reserves are read
    consistently and the invariant holds. Two single-hop swap functions:
    - `swapExactUSDCForTokens(amountIn, amountOutMin, pair, to)`
    - `swapExactTokensForUSDC(amountIn, amountOutMin, pair, to)`
    Uses `SafeUSDC` for Arc's non-standard transferFrom return values.
    Slippage protection via `amountOutMin`, zero-address + zero-input checks.
    0% swap fee (matches the AMM). No multi-hop, no WETH wrapping.
    7/7 forge tests pass (single swaps both directions, slippage revert,
    zero-address revert, zero-input revert, sequential swaps preserve k,
    multiple swaps all succeed with correct price impact ordering).
    All 33 contract tests pass (26 original + 7 new AMMRouter tests).
    NOT YET deployed to Arc testnet — deploy when concurrent AMM swaps are
    needed (post-graduation trading). The bonding curve (not the AMM) is the
    primary trading venue, so this is not blocking for testnet launch.
    Files: `contracts/src/AMMRouter.sol`, `contracts/test/AMMRouter.t.sol`,
    `contracts/test/mocks/MockToken.sol`.
  Referral links — complete. Wallet-to-wallet referral attribution with
    off-chain reward accounting (USDC payout is v2). Flow: user shares
    `https://orba.fun/?ref=<wallet>`, visitor's browser stores referrer in
    localStorage, auto-attributes on first auth. Indexer updates referral
    stats (trade_count, total_volume_usdc, reward_earned_usdc) on every
    trade by a referred wallet. Reward = 0.1% of volume (10 bps, 10% of the
    1% trading fee), configurable via `REFERRAL_REWARD_PCT_BPS` env.
    DB: `referrals` table (referrer_wallet, referred_wallet UNIQUE,
      trade_count, total_volume_usdc, reward_earned_usdc, first_token_address).
      Added to `apps/api/db/schema.sql` + standalone `migrate_referrals.sql`.
    API (new `apps/api/src/referrals/` module, all wallet-auth via AuthGuard):
    - `POST /referrals/attribute` — record attribution (first-click-wins,
      idempotent, self-referral blocked)
    - `GET /referrals/:wallet` — referral stats (total/active referred, volume,
      rewards)
    - `GET /referrals/:wallet/referred` — paginated list of referred wallets
    - `GET /referrals/:wallet/referrer` — who referred this wallet
    - `GET /referrals/leaderboard/top` — top referrers by attributed volume
    Indexer: `apps/api/src/indexer/indexer.service.ts` updated to increment
      referral stats inline in the buy/sell DB transaction.
    Frontend:
    - `apps/web/src/lib/use-referral.ts` — captures `?ref=` from URL, stores
      in localStorage, auto-attributes on auth (site-wide via providers.tsx)
    - `apps/web/src/components/ReferralPanel.tsx` — referral link (copyable),
      stats, and referred wallets list on the profile page
    - `apps/web/src/app/profile/[wallet]/page.tsx` — added ReferralPanel
    - `apps/web/src/lib/api.ts` — 5 new API client functions
  Smoke test (2026-07-25): all 3 new pages serve HTTP 200 with no errors.
    Leaderboard renders with all 3 tab labels. Coin + profile pages render
    (ShareButton + ReferralPanel hydrate client-side). All 4 referral API
    endpoints return correct JSON. API + frontend `tsc` clean. 33/33 contract
    tests pass.
  Branding refresh (2026-07-25): sharp-corner design + official Orba logo/favicon.
    - Border radius set to 0px site-wide via `borderRadius` override in
      `apps/web/tailwind.config.ts` (all `rounded-*` utilities now resolve to 0).
      Inline `borderRadius: '12px'` on the react-hot-toast container in
      `apps/web/src/app/layout.tsx` changed to `0px`. The OG image generator
      (`opengraph-image.tsx`) keeps its radii since it renders a social preview
      image, not website chrome.
    - Favicon: replaced dynamic `apps/web/src/app/icon.tsx` (diamond glyph) with
      static `apps/web/src/app/icon.png` (orba-favicon-32.png from brand kit).
      Next.js app router auto-detects `icon.png` as the favicon. Also added
      `apps/web/src/app/apple-icon.png` (orba-icon-192.png) for iOS home-screen.
    - Navbar + Footer logo: replaced the `◆ Orba` text glyph with the official
      `orba-logo-light.svg` (full wordmark + tagline, USDC-blue orb icon).
      Files in `apps/web/public/`: orba-logo-light.svg, orba-logo-light.png,
      orba-logo-dark.svg, orba-icon.svg, orba-icon-192.png, orba-icon-512.png.
      Navbar renders at h-7, Footer at h-8 (dark theme → light variant).
    Build verified: `npx tsc --noEmit` clean, `npx next build` succeeds,
      `/icon.png` + `/apple-icon.png` routes registered.
  Steep design system retheme (2026-07-25): dark → light editorial aesthetic.
    Applied the "Steep" style reference (serif analytics on warm paper) from
    `DESIGN.md` / `theme.css` / `variables.css` / `tokens.json`. Light theme,
    Signifier serif headlines (Source Serif 4 fallback via Google Fonts),
    Sohne body (Inter fallback), pill buttons (9999px), 24px card radius,
    peach #fbe1d1 + sienna #5d2a1a accent pair on white canvas.
    - `apps/web/tailwind.config.ts` — semantic tokens remapped so all 23+
      files using `bg-bg-*`, `text-text-*`, `accent-*` adopt the new palette
      without per-file edits. bg.base #ffffff, bg.card #f2f2f3, bg.border
      #ececec, text.primary #17191c, accent.green → ink-black #17191c (primary
      action), accent.peach + accent.sienna added. Radii: sm 12px, md 16px,
      lg 20px, xl/2xl/3xl 24px, full 9999px. Shadows: subtle / subtle-2 /
      subtle-3 added. Fonts: serif (Source Serif 4) + sans (Inter) stacks.
    - `apps/web/src/app/globals.css` — light theme base: white canvas with
      subtle warm peach radial wash, h1/h2 use font-serif font-normal with
      tight tracking. Component classes updated: `.card` (mist-gray, 24px,
      no border), `.card-elevated` (white + shadow-subtle-3), `.card-peach`
      (blush-peach/sienna), `.btn-*` (pill shape), `.input` (white fill,
      hairline border, 16px), `.badge-*` (pill), `.tab` (whisper-quiet).
    - `apps/web/src/app/layout.tsx` — removed `className="dark"` from <html>,
      added Source Serif 4 to Google Fonts link, toast styling → white bg,
      ink-black text, 24px radius, subtle shadow.
    - `apps/web/src/app/page.tsx` — hero h1 now serif font-normal at
      4xl/6xl/7xl with sienna italic accent on "Orba"; StatCards use
      `.card-elevated`; removed neon-green + emoji from hero/numbers.
    - `apps/web/src/components/PriceChart.tsx` — chart stroke #5d2a1a
      (sienna), gradient fill sienna 18%→0, axis lines #ececec, tick text
      #979799, tooltip white + 16px radius + subtle shadow.
    - `apps/web/src/components/TradePanel.tsx` — buy tab `text-black` →
      `text-white` (since accent-green is now ink-black).
    - Functional trading colors preserved but muted: accent.red #9b2c2c
      (sell), accent.orange #b45309 (warning), accent.yellow #a16207
      (caution). OG image generators left as-is (separate social preview
      images, not site chrome).
    Dev server verified: all 6 pages (/, /explore, /launch, /leaderboard,
      /agents, /docs) serve HTTP 200, no compile errors.

## Key files
- `00_MASTER_PLAN.md` — overview, timeline (15-17 weeks), anti-rug mechanics
- `01_PHASE0_research_foundation.md` through `06_PHASE5_launch_growth.md` — phase specs
- `DECISION_LOG.md` — all research findings and product decisions (READ THIS FIRST)
- `packages/shared/src/index.ts` — Arc chain config, contract addresses, constants
- `scripts/check-balance.js` — verify wallet USDC balance on Arc testnet
- `scripts/e2e-full-flow.js` — full E2E test (launch → buy → sell), uses fallback RPC transport
- `.env.example` — environment template with confirmed Arc values
- `apps/api/src/rpc/rpc.controller.ts` — same-origin JSON-RPC read proxy (4-provider rotation)
- `apps/api/src/indexer/arc-event-poller.service.ts` — direct eth_getLogs poller (5s interval, 4-provider rotation)
- `apps/web/src/lib/config.ts` — wagmi config with fallback transport (API /rpc proxy first, then direct RPCs)
- `apps/web/src/lib/use-arc-receipt.ts` — fallback receipt poller (rotates providers, polls API proxy first)
- `apps/web/src/lib/utils.ts` — formatters: `formatUsdc` (micro-USDC /1e6), `formatUsdDirect` (already-dollars), `formatNativeUsdc` (18-dec native /1e18)
- `contracts/src/AMMRouter.sol` — atomic swap router (fixes concurrent "AMM: K" bug)
- `apps/api/src/referrals/` — referral attribution + stats module (DB, API, indexer hook)
- `apps/web/src/app/leaderboard/page.tsx` — leaderboard UI (3 tabs: gainers, volume, creators)
- `apps/web/src/components/ShareButton.tsx` — share dropdown on coin page (copy link / native share / X intent)
- `apps/web/src/components/ReferralPanel.tsx` — referral link + stats on profile page
- `apps/web/src/lib/use-referral.ts` — captures `?ref=` query param, auto-attributes on auth

## Arc-specific gotchas (see DECISION_LOG.md for full detail)
- USDC is the native gas token. 18-dec native, 6-dec ERC-20, same asset.
- Use 6-dec ERC-20 view everywhere except gas math. Never mix the two.
- **Arc USDC has non-standard return values**: `transfer` returns bool, but
  `transferFrom` returns void. Use `SafeUSDC` library (low-level call). See D22.
- **Arc system precompiles** (0x1800...0000, 0x1800...0001) don't exist in anvil
  fork mode. Tier 2 tests use MockUSDC. Real runtime validated on-testnet. See D23.
- Block time ~0.5s. Deterministic finality (N=1, no reorgs).
- No on-chain DEX exists — we deploy our own Uniswap V2 fork for graduation.
- anvil can't reproduce Arc behavior — integration tests must hit Arc testnet RPC.
- Blocklisted test address: 0x70997970C51812dc3A010C7d01b50e0d17dc79C8
- LP burn to 0x...dEaD (not address(0), due to Arc's zero-address rules)
- **RPC rate limits**: Arc testnet's primary endpoint (`rpc.testnet.arc.io`)
  aggressively returns `-32011 request limit reached`. We rotate between all 4
  public providers (Circle, dRPC, QuickNode, Blockdaemon) — each has independent
  rate-limit buckets, giving 4x effective quota. Configured via `ARC_RPC_URLS`
  (backend) and `NEXT_PUBLIC_ARC_RPC_URLS` (frontend) in `.env`. Three layers
  of rotation:
  1. **Backend poller** (`arc-event-poller.service.ts`) — `rpcCall()` rotates
     providers on each call and on rate-limit errors. Polls every 5s.
  2. **API `/rpc` proxy** (`rpc.controller.ts`) — same-origin JSON-RPC read
     proxy for the frontend. Whitelisted read methods only (writes rejected
     with 403). Rotates providers server-side. Used by wagmi's transport.
  3. **Frontend fallback** (`config.ts`) — viem `fallback()` transport lists
     the API `/rpc` proxy first, then the 4 direct provider URLs. If the
     proxy is down, direct RPCs are tried in order.
- **Browser shields/adblockers** can silently block cross-origin fetches to
  third-party RPC domains, causing every wagmi read to fail (balance shows $0,
  quotes never load, receipts never confirm). Routing reads through the
  same-origin `/rpc` proxy avoids this entirely. The fallback receipt poller
  (`use-arc-receipt.ts`) also polls the proxy first and logs `[arc-receipt]`
  warnings to the console on failure (instead of hanging silently).
- **wagmi chainId pinning**: every `useReadContract`, `useBalance`,
  `useWaitForTransactionReceipt`, and `writeContract` call in the frontend
  pins `chainId: arcTestnet.id`. Without this, wagmi defaults to the wallet's
  reported chain — if the wallet is misconfigured or on a different network,
  reads silently fail. `TradePanel.tsx`, `launch/page.tsx`, and `Navbar.tsx`
  also detect wrong-network and show a "Switch to Arc Testnet" button.
- **Arc mainnet**: chain ID `5042` (testnet is `5042002`). **Mainnet is public
  since 2026-09-16** — 4 open RPC endpoints, no API key (live-tested,
  `eth_chainId` → 0x13b2 on each):
  - `https://rpc.mainnet.arc.io` (Circle primary)
  - `https://rpc.drpc.mainnet.arc.io`
  - `https://rpc.quicknode.mainnet.arc.io` (+ `wss://rpc.quicknode.mainnet.arc.io`)
  - `https://rpc.blockdaemon.mainnet.arc.io` (+ `wss://.../websocket`)
  Independent explorer/gateway: `https://arc-scan.org` / `https://rpc.arc-scan.org`
  (third-party, metered, no trace_/debug_). Alchemy also supports Arc mainnet
  (`arc-mainnet.g.alchemy.com`) — enable the network for your app first.
  Protocol contracts must be (re)deployed to mainnet before the app boots:
  mainnet contract addresses in `.env` / `ARC_MAINNET_CONTRACTS`
  (packages/shared) are intentionally empty and the app fails closed.

## Commands
```bash
# Check wallet balance on Arc testnet
node scripts/check-balance.js <wallet-address>

# Install deps
npm install

# Foundry (installed at ~/.foundry/bin, added to PATH)
# Run all tests (Tier 1 local + Tier 2 Arc fork):
forge test --root contracts
# Run only Tier 1 (local, fast):
forge test --root contracts --match-contract BondingCurveTest
# Run only Tier 2 (Arc fork, slower):
forge test --root contracts --match-contract ArcIntegrationTest

# Bonding curve economics model:
node scripts/bonding-curve-model.js

# Infrastructure (Postgres + Redis):
docker compose up -d
docker compose down

# API:
cd apps/api && npm run dev    # development (watch mode)
cd apps/api && npm run build  # build
cd apps/api && npm start      # production

# Indexer (Direct Arc RPC Poller — default, no Docker/WSL required):
# The ArcEventPollerService runs inside the NestJS API process and polls
# Arc RPC directly via eth_getLogs every 5 seconds. Enabled by default
# via ARC_POLLER_ENABLED=true in .env. Rotates between 4 RPC providers.
# No separate process to start. Sync state tracked in indexer_sync_state
# table (entity = 'ArcEventPoller').

# Indexer (Envio HyperIndex V3 — optional fallback, requires WSL + Docker):
# DISABLED by default. Envio was replaced by the direct RPC poller above.
# Code remains in apps/api/src/indexer/envio-poller.service.ts for reference.
# To re-enable: set INDEXER_GRAPHQL_URL in .env and start Envio in WSL:
#   wsl -e bash "/mnt/c/Project folder/arc launchpad/indexer/run-wsl2.sh"
# Or manually:
cd indexer && npm run codegen  # generate types from config (run in WSL)
cd indexer && npm run dev      # development mode (run in WSL with Docker)
# Hasura GraphQL API available at http://localhost:8088/v1/graphql (port 8088
# to avoid conflict with other services on 8080; see indexer/start-hasura.sh)
# Admin secret: "testing"
# STRINGIFY_NUMERIC_TYPES=true is required (BigInt values exceed JS number range)

# E2E test (requires funded deployer wallet — see DEPLOYER_PRIVATE_KEY in .env):
node scripts/e2e-full-flow.js          # launch → buy → sell
node scripts/e2e-trade-test.js         # buy + sell on existing token
node scripts/e2e-sell-test.js <curve> <amount>  # sell only
node scripts/e2e-graduation.js         # launch → buy to $25K MC → migrate → verify
node scripts/e2e-graduation.js --token=0x...  # graduate an existing token
# Graduation test needs ~$9000 USDC in the deployer wallet (gets testnet USDC
# from https://faucet.circle.com). It buys in $100 chunks, transferring tokens
# to throwaway addresses between buys to stay under the 4% max-wallet limit.

# Load test (Phase 4 — concurrent buys on a bonding curve):
node scripts/load-test-buys.js <curve-address> [concurrency=10] [usdc-per-buy=1]
# Generates N ephemeral buyer wallets, funds them from the deployer, then fires
# N concurrent buys on the same curve. Measures throughput, success rate, contract
# reverts, on-chain state integrity, and indexer lag. Needs (N * usdc-per-buy +
# N * 0.5) USDC in the deployer wallet for funding. Pass criteria: >=80% success,
# 0 contract reverts, consistent on-chain state.

# Budget graduation test (Phase 4 — graduation + anti-rug verification):
node scripts/load-test-graduation.js
# Deploys TestTokenFactory + TestBondingCurve (low $4,150 threshold), launches a
# token, buys to graduation, migrates, and verifies all anti-rug mechanics.
# ~$130 USDC cost (vs ~$9,000 for production threshold).

# AMM swap test (Phase 4 — post-graduation swap verification):
node scripts/load-test-amm-swaps-simple.js [num-swaps=5] [usdc-per-swap=1]
# Sequential buy+sell swaps on a graduated token's AMM pair. Verifies the
# constant-product invariant holds. Requires load-test-graduation.js to have
# run first (generates addresses JSON). ~$10 USDC cost.

# Heavy buy test (Phase 4 — large single buy):
node scripts/load-test-heavy-buy.js <curve-address> [usdc-amount=20]
# Single large buy on a bonding curve. Tests price impact, indexer under load,
# and on-chain state consistency. ~$20 USDC cost.

# Frontend (Next.js 15):
cd apps/web && npm run dev     # dev server on port 3000
cd apps/web && npm run build   # production build
cd apps/web && npm run start   # production server

# Full local stack:
docker compose up -d                    # start Postgres + Redis
cd apps/api && node dist/main.js        # start API on port 4000
cd apps/web && npx next dev -p 3000     # start frontend on port 3000
```

## Tech stack
- Contracts: Solidity + Foundry
- Frontend: Next.js 15 + viem/wagmi (arcTestnet chain is built into viem)
- Backend: NestJS + PostgreSQL + Redis
- Indexer: Direct Arc RPC poller (`ArcEventPollerService`) — polls `eth_getLogs` every 5s
- RPC proxy: `POST /rpc` on the API — same-origin read proxy for the frontend, 4-provider rotation
- Data flow: Arc RPC → eth_getLogs (NestJS poller, every 5s) → IndexerService.processEvent() → Postgres + Redis pub/sub → WebSocket → Frontend
- Frontend reads: wagmi → API `/rpc` proxy (same-origin) → 4 Arc RPC providers (rotated)
- Arc RPC: 4 providers (Circle, dRPC, QuickNode, Blockdaemon) — chain ID 5042002

## Database notes
- 18-decimal token amounts use NUMERIC(40,0) columns (BigInt max ~9.2e18 is too small for 1e27 tokens)
- 6-decimal USDC amounts use BIGINT columns (max ~9.2e18, plenty for 6-dec USDC)
- `market_cap` and `volume_24h` are NUMERIC(20,6) stored in **USDC dollars** (not micro-USDC)
- `real_usdc`, `creator_fees_accrued`, `protocol_fees_accrued`, `usdc_amount` are BIGINT stored in **micro-USDC** (6-dec)
- The NestJS API loads .env from `../../.env` (project root) via dotenv
- Schema migrations: `cd apps/api && npm run db:migrate` (idempotent, uses IF NOT EXISTS)
- Direct Arc RPC poller sync state tracked in `indexer_sync_state` table (entity = 'ArcEventPoller')

## Frontend formatting (IMPORTANT — easy to get wrong)
The frontend has THREE USDC formatters in `apps/web/src/lib/utils.ts` — using the wrong one causes values to display off by 1e6× or 1e12×:
- `formatUsdc(x)` — divides by 1e6. For micro-USDC fields from the DB: `real_usdc`, `creator_fees_accrued`, `protocol_fees_accrued`, `usdc_amount`, `total_volume_usdc`.
- `formatUsdDirect(x)` — no division. For values already in dollars: `market_cap`, `volume_24h`, `CREATION_FEE`.
- `formatNativeUsdc(x)` — divides by 1e18. For Arc native balance from `useBalance` (18-dec native USDC).
- `formatTokens(x)` — divides by 1e18. For 18-dec token amounts.
- `formatPrice(x)` — no division. For `price` (already USDC-per-token in dollars).
