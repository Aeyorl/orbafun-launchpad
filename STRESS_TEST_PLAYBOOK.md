# Stress Test Playbook — Arc.fun (A-Z, full project)

**Testnet only. Never run anything in this doc against mainnet.**
**Every finding goes in the "Findings log" at the bottom — do not DM findings, write them down.**

This guide covers the entire project surface — contracts, API, indexer, WebSocket, RPC proxy, frontend, and every feature module. Two testers split the work:
- **Tester A — Load, scale, infrastructure, reliability** (does it hold up under pressure?)
- **Tester B — Functional correctness, financial math, every endpoint, every page** (does it work right?)

Both testers read sections 0–2 in full before starting. Then each takes their own section.

---

## 0. Project surface (what exists — read this first)

### Smart contracts (`contracts/src/`)
| File | Purpose |
|---|---|
| `BondingCurve.sol` | Core: constant-product curve, buy/sell/launch, graduation trigger, fee accrual |
| `TokenFactory.sol` | Launches new tokens + curves, marks graduation |
| `MemeToken.sol` | ERC-20 with 4% max-wallet + 30-block cooldown (pre-graduation), renounces on graduation |
| `LiquidityMigration.sol` | Graduation: curve → AMM, LP burn to `0x...dEaD` |
| `AMMFactory.sol` / `AMMPair.sol` | Uniswap V2 fork for post-graduation trading |
| `Treasury.sol` | Protocol fee collection, owner-only withdraw |
| `SafeUSDC.sol` | Low-level USDC calls (Arc's `transferFrom` returns void — D22) |

### API modules (`apps/api/src/`)
| Module | Endpoints | Purpose |
|---|---|---|
| `tokens` | `GET /tokens`, `GET /tokens/stats`, `GET /tokens/:address`, `GET /tokens/:address/trades`, `GET /tokens/:address/holders` | Token list, stats, detail, trade history, holders |
| `leaderboard` | `GET /leaderboard` | Top tokens by volume/market cap |
| `favorites` | `GET /favorites`, `POST /favorites/:tokenAddress`, `DELETE /favorites/:tokenAddress`, `GET /favorites/:tokenAddress` | User watchlist (auth-required) |
| `messages` | `GET /messages`, `POST /messages` | Token chat messages |
| `token-metadata` | `GET /token-metadata`, `POST /token-metadata` | Custom token metadata (social links, description) |
| `users` | `GET /users/:wallet` | User profile (stats, holdings) |
| `auth` | `GET /auth/nonce`, `POST /auth/verify` | SIWE (Sign-In with Ethereum) auth |
| `upload` | `GET /upload/status`, `POST /upload/image` | Token image upload |
| `rpc` | `POST /rpc` | Same-origin JSON-RPC read proxy (4-provider rotation, writes rejected 403) |
| `indexer` | `POST /indexer/event`, `POST /indexer/batch` | Internal event ingestion (poller → indexer service) |
| `agents` | 22 endpoints — see below | Agent-launched tokens, templates, tipping, deployer |
| `referrals` | `POST /referrals/attribute`, `GET /referrals/leaderboard/top`, `GET /referrals/:wallet`, `GET /referrals/:wallet/referred`, `GET /referrals/:wallet/referrer` | Referral tracking + attribution |
| `websocket` | WS `/` | Real-time token events via Redis pub/sub → socket.io |

### Agents module endpoints (full list)
```
POST   /agents/register
POST   /agents/launch
GET    /agents/me
GET    /agents/me/launches
POST   /agents/tokens/:address/messages
POST   /agents/tokens/:address/metadata
POST   /agents/tokens/:address/buy
POST   /agents/tokens/:address/sell
GET    /agents/me/trades
GET    /agents
GET    /agents/templates
GET    /agents/templates/:id
POST   /agents/templates
POST   /agents/templates/:id/deploy
GET    /agents/leaderboard
POST   /agents/:agentId/tip
GET    /agents/:agentId/tips
GET    /agents/:agentId
GET    /agents/:agentId/launches
GET    /agents/:agentId/activity
GET    /agents/deployer/balance
POST   /agents/deployer/approve
```

### Frontend pages (`apps/web/src/app/`)
| Route | Page |
|---|---|
| `/` | Home — live ticker, token grid |
| `/explore` | Explore all tokens |
| `/launch` | Launch a new token |
| `/coin/[address]` | Token detail — trade panel, chart, holders, chat, trade history |
| `/leaderboard` | Leaderboard |
| `/watchlist` | User's favorited tokens (auth-required) |
| `/profile/[wallet]` | User profile — holdings, trade history |
| `/agents` | Agent directory |
| `/agents/[agentId]` | Agent detail |
| `/fees` | Fee structure info |
| `/docs` | Docs |
| `/blog` | Blog |
| `/legal/*` | Legal pages (terms, privacy, DMCA, trademark, tokenized-agent disclaimer) |

### Frontend components
`TradePanel`, `PriceChart`, `HoldersPanel`, `TokenChat`, `TradeHistory`, `TokenCard`, `TokenGrid`, `LiveTicker`, `Navbar`, `Footer`, `SearchBar`, `FavoriteButton`, `ShareButton`, `SocialLinks`, `ImageUploader`, `ReferralPanel`, `LegalPage`

### Frontend lib
| File | Purpose |
|---|---|
| `config.ts` | wagmi config, fallback transport (API /rpc proxy first, then 4 direct RPCs), chainId pinning |
| `api.ts` | API client wrapper |
| `use-arc-receipt.ts` | Fallback receipt poller (rotates providers, polls proxy first) |
| `use-auth.ts` | SIWE auth hook |
| `useWebSocket.ts` | WS client with auto-reconnect |
| `use-referral.ts` | Referral attribution hook |
| `utils.ts` | USDC formatters — **using the wrong one is the #1 frontend bug** |

### Data flow
```
User tx → Arc chain → eth_getLogs (poller, 5s) → IndexerService.processEvent()
  → Postgres (tokens, trades, holders tables)
  → Redis pub/sub ('token:events')
  → WebSocket gateway → socket.io rooms (tokens:global, token:{address})
  → Frontend (useWebSocket.ts)

Frontend reads → wagmi → API /rpc proxy (same-origin) → 4 Arc RPC providers (rotated)
```

---

## 1. The numbers you need to know

### Token economics (from `BondingCurve.sol`, `MemeToken.sol`)
| Constant | Value | Notes |
|---|---|---|
| `TOTAL_SUPPLY` | 1B tokens (18-dec) | Fixed, no mint |
| `SUPPLY_ON_CURVE` | 880M (88%) | Sold via curve |
| `SUPPLY_RESERVED` | 120M (12%) | Seeded to AMM on graduation |
| `VIRTUAL_USDC` | 5,866.67 USDC (6-dec) | Virtual reserve |
| `VIRTUAL_TOKENS` | 1,466,666,667 (18-dec) | Virtual reserve |
| `GRADUATION_MARKET_CAP` | $25,000 (6-dec) | Triggers graduation |
| `LP_SEED_USDC` | $8,500 (6-dec) | USDC seeded to AMM |
| `FEE_BPS` | 100 (1%) | Buys: from input. Sells: from output |
| `CREATOR_FEE_SHARE_BPS` | 5000 (50%) | 50% creator / 50% protocol |
| `MAX_WALLET_PCT` | 4% | 40M tokens, pre-graduation only |
| `COOLDOWN_BLOCKS` | 30 (~15s) | User-to-user transfers, pre-graduation |
| `BURN_ADDRESS` | `0x...dEaD` | LP tokens burned here |
| `USDC_ADDRESS` | `0x3600...0000` | 6-dec ERC-20 on Arc |
| Blocklisted test addr | `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` | USDC transfers to it revert (D5) |
| Initial MC after launch | ~$4,000 | `(VIRTUAL_USDC * TOTAL_SUPPLY) / VIRTUAL_TOKENS` |
| Arc block time | ~0.5s | Deterministic finality, no reorgs |
| Testnet chain ID | `5042002` | Mainnet is `5042` (not used yet) |
| WebSocket `MAX_CONN_PER_IP` | 5 | Per-IP connection cap in WS gateway |

### The three USDC formatters (frontend — `apps/web/src/lib/utils.ts`)
- `formatUsdc(x)` — divides by 1e6. For micro-USDC DB fields: `real_usdc`, `creator_fees_accrued`, `protocol_fees_accrued`, `usdc_amount`, `total_volume_usdc`.
- `formatUsdDirect(x)` — no division. For values already in dollars: `market_cap`, `volume_24h`, `CREATION_FEE`.
- `formatNativeUsdc(x)` — divides by 1e18. For Arc native balance from `useBalance` (18-dec native USDC).
- `formatTokens(x)` — divides by 1e18. For 18-dec token amounts.
- `formatPrice(x)` — no division. For `price` (already USDC-per-token in dollars).

**If a value looks off by 1e6× or 1e12×, the wrong formatter was used. Log it.**

---

## 2. Setup (both testers)

### Prerequisites
```bash
npm install
cp .env.example .env             # fill in values; ask Lead for RPC URLs
```

### Fund your wallets
- Get testnet USDC at https://faucet.circle.com
- You need 2–3 funded wallets for parallel testing
- **Do not use the deployer wallet.** Coordinate separate wallets with the Lead.
- Graduation tests need ~$9,000 USDC per run — coordinate with Lead before running `e2e-graduation.js`.

### Verify your env works
```bash
node scripts/check-balance.js <your-wallet>     # confirms RPC + wallet reachable
node scripts/e2e-full-flow.js                   # ~30s, launch → buy → sell. MUST pass first.
```
If `e2e-full-flow.js` fails, do not start testing. Fix your env first.

### Useful scripts during testing
```bash
node scripts/check-balance.js <addr>            # wallet USDC balance
node scripts/check-curve.js <curve-addr>        # curve state (realUsdc, tokensSold, price, MC)
node scripts/check-trades.js <token-addr>       # recent trades for a token
node scripts/check-recent-logs.js               # recent on-chain events
node scripts/check-receipts.js <tx-hash>        # tx receipt details
node scripts/bonding-curve-model.js             # off-chain curve model — compare to on-chain
```

### Start the full local stack
```bash
docker compose up -d                            # Postgres + Redis
cd apps/api && npm run dev                      # API + indexer on :4000
cd apps/web && npm run dev                      # frontend on :3000
```

### What to monitor during every test
- **API logs**: watch for errors, `-32011` RPC rate limits, slow queries, unhandled promise rejections
- **Indexer lag**: `SELECT * FROM indexer_sync_state WHERE entity = 'ArcEventPoller';` — compare `last_processed_block` to current block
- **Browser console** (if testing via UI): watch for `[arc-receipt]` warnings, React errors, failed fetches
- **Postgres**: `SELECT count(*), state FROM pg_stat_activity GROUP BY state;` for connections; `SELECT * FROM pg_locks WHERE NOT granted;` for lock waits
- **Redis**: `redis-cli PUBSUB CHANNELS` to see active channels; `redis-cli INFO clients` for connection count

### How to report a finding
Append to "Findings log" at the bottom of this file:
```
### F<n> — <short title>
- Severity: Critical / High / Medium / Low
- Found by: A or B
- Date: YYYY-MM-DD
- Scenario: <which one, e.g. "B6-fee-split">
- Repro:
  1. <step>
  2. <step>
- Expected: <what should happen>
- Actual: <what happened>
- Evidence: <tx hash, log excerpt, screenshot path, HTTP response>
- Status: Open / Fixed / Wontfix
```

**Severity guide:**
- **Critical**: funds can be lost, drained, or stuck; auth bypass; mainnet must not ship until fixed
- **High**: incorrect state, broken core flow, indexer permanently diverges from chain, data loss
- **Medium**: degraded UX under load, recoverable state, missing error surface to user, perf regression
- **Low**: cosmetic, edge UX, non-blocking

---

# TESTER A — Load, Scale, Infrastructure, Reliability

**Your job: find where the platform breaks under pressure. Not logic bugs (that's Tester B).**
**Read `apps/api/src/indexer/arc-event-poller.service.ts`, `apps/api/src/rpc/rpc.controller.ts`, `apps/api/src/websocket/websocket.gateway.ts` before starting.**

## A1 — Concurrent buys on a single curve
**Goal**: many wallets buying the same token simultaneously.

**Steps**:
1. Launch a token via `e2e-full-flow.js` (note the curve address from output)
2. Fund 5–10 wallets with testnet USDC (coordinate with Lead)
3. Each wallet: `usdc.approve(curve, type(uint256).max)`
4. Fire `buy` txs from all wallets for 60s — mix small ($1–5) and large ($50–100), mix burst and steady
5. Stop, let indexer catch up

**Verify**:
- All valid buys succeeded (`SlippageExceeded` and `MaxWalletExceeded` are expected reverts, not bugs)
- `curve.realUsdc() + curve.creatorFeesAccrued() + curve.protocolFeesAccrued()` == sum of USDC sent by buyers (conservation)
- `curve.tokensSold()` == sum of tokens received by all buyers
- Indexer caught up within 30s (check `indexer_sync_state`)
- No DB deadlocks in API logs
- RPC rotation absorbed load (some `-32011` OK if rotation handled them; a flood means rotation isn't working)

**Pass criteria**: valid buys succeed; funds conserved; indexer <30s catchup; no deadlocks

---

## A2 — Concurrent buys + sells (mixed traffic)
**Goal**: buys and sells hitting the same curve simultaneously.

**Steps**:
1. Launch a token, 5 wallets buy first (so they have tokens to sell)
2. 5 wallets keep buying, 5 wallets start selling in rounds, for 60s

**Verify**:
- `curve.realUsdc()` matches expected value after all txs settle
- `curve.tokensSold()` matches (decreases on sells, increases on buys)
- No wallet sold more tokens than it held (should revert with `InsufficientLiquidity`, not corrupt state)
- Indexer sequences events correctly — DB `trades` rows match on-chain event order

**Pass criteria**: state consistent; no double-spend; indexer order matches chain

---

## A3 — WebSocket connection flood + per-IP limit
**Read first**: `apps/api/src/websocket/websocket.gateway.ts` — `MAX_CONN_PER_IP = 5`

**Steps**:
1. Write a Node socket.io client (ask Lead before adding to repo — keep in `scripts/`)
2. **Sub-test a — per-IP limit**: From one IP, open 6 WS connections. The 6th should be rejected with a disconnect. Verify the API logs show "Connection rejected — IP ... has 5 connections".
3. **Sub-test b — many IPs**: From 20+ different source IPs (use proxies or multiple machines), open 5 connections each (100 total). All should succeed.
4. **Sub-test c — event delivery under load**: With 100 connections across IPs subscribed to `tokens:global` and `token:{address}`, trigger buys/sells (run A1 in parallel). Measure time from on-chain event emission to WS message receipt on each client.

**Verify**:
- Per-IP limit enforced at exactly 5 (6th rejected)
- 100+ connections across IPs stay alive for 5 minutes
- Events delivered to ALL connections within 5 seconds of on-chain confirmation
- No message loss (count on-chain events vs messages received — must match)
- API memory stays bounded (no leak from connection accumulation)
- Heartbeat works: kill a client abruptly, verify server detects within ~25s (pingInterval 15s + pingTimeout 10s) and cleans up

**Pass criteria**: per-IP limit at 5; 100+ cross-IP conns alive 5min; events <5s; no loss; no leak; dead conns cleaned

---

## A4 — RPC rate-limit exhaustion (4-provider rotation)
**Read first**: `apps/api/src/rpc/rpc.controller.ts`, `apps/api/src/indexer/arc-event-poller.service.ts`

**Steps**:
1. Use `artillery` or `k6` to send sustained reads to `POST /rpc`:
   - Methods: `eth_blockNumber`, `eth_getLogs`, `eth_call` (whitelisted)
   - Ramp from 10/s to 200/s over 2 minutes
2. Watch API logs for `-32011 request limit reached` from providers

**Verify**:
- Proxy rotates to next provider on `-32011` (check logs for rotation)
- Client-side error rate <1% until ALL 4 providers are simultaneously rate-limited
- When all 4 limited, clients get a clear error (not a hang)
- Indexer poller (separate from proxy) also rotates and doesn't stall
- **Write method rejection**: send `eth_sendRawTransaction` to `/rpc` — must get 403. Try `eth_sendTransaction`, `personal_sign`, `eth_sign` — all must 403.

**Pass criteria**: rotation works; <1% errors until all 4 exhausted; writes rejected 403; no hangs

---

## A5 — Indexer lag under sustained event volume
**Steps**:
1. Run A1 continuously for 10 minutes
2. Every 30s, snapshot: on-chain block number vs `indexer_sync_state.last_processed_block`
3. After stopping, wait for catchup, then compare on-chain `Buy`/`Sell` event count (via `eth_getLogs`) to DB `trades` row count

**Verify**:
- Indexer lag stays under 30s during sustained load
- Catches up within 60s after load stops
- Zero missed events (on-chain count == DB count)
- No duplicate DB rows (check for duplicate tx hashes in `trades`)

**Pass criteria**: lag <30s under load; catchup <60s; zero missed/duplicate events

---

## A6 — Database write contention
**Steps**:
1. Run A1 while monitoring Postgres:
   ```sql
   SELECT count(*), state FROM pg_stat_activity GROUP BY state;
   SELECT * FROM pg_locks WHERE NOT granted;
   SELECT * FROM pg_stat_activity WHERE wait_event IS NOT NULL;
   ```
2. Watch tables: `trades`, `tokens`, `indexer_sync_state`, `holders`, `messages`

**Verify**:
- No deadlocks (check API logs for "deadlock")
- No long-held locks (>1s)
- No connection pool exhaustion (check NestJS DB pool config in `apps/api`)
- `indexer_sync_state` updates don't block trade inserts

**Pass criteria**: no deadlocks; no locks >1s; no pool exhaustion

---

## A7 — Frontend under load
**Steps**:
1. Start frontend: `cd apps/web && npm run dev`
2. Open app in 3+ browser tabs
3. Run A1 in background (backend under load)
4. In each tab: view a token, check balance, attempt a buy, watch for confirmation

**Verify**:
- Balance displays correctly (not $0 — if $0, browser shields blocking RPC; same-origin proxy should prevent this)
- Quotes load (buy/sell preview works)
- Trade submissions surface errors clearly (not silent hangs)
- Receipt polling works (console `[arc-receipt]` warnings OK, hangs not OK)
- Wrong-network detection works (switch wallet to wrong chain → "Switch to Arc Testnet" button appears)
- LiveTicker updates in real-time (WS events flowing)
- PriceChart updates in real-time on coin page

**Pass criteria**: UI responsive; no silent failures; errors surface; receipts confirm or warn; live updates flow

---

## A8 — Long-running stability (1 hour)
**Steps**:
1. Moderate load: 1 buy + 1 sell every 2s for 1 hour (script with 2–3 wallets)
2. Every 5 minutes, snapshot: API process memory (RSS), DB connection count, indexer lag, RPC error count

**Verify**:
- API memory stays flat (no upward trend = leak)
- DB connections stay bounded (return to baseline after idle)
- Indexer lag stays bounded (no upward drift)
- No API restart needed
- Redis pub/sub channel stays healthy (`redis-cli PUBSUB CHANNELS` shows `token:events`)

**Pass criteria**: flat memory; bounded connections; bounded lag; no restarts; Redis healthy

---

## A9 — Image upload under load
**Read first**: `apps/api/src/upload/upload.controller.ts`

**Steps**:
1. Check `GET /upload/status` returns healthy status
2. Upload 10 images concurrently via `POST /upload/image` (use small + large PNGs/JPGs)
3. Verify all return a URL
4. Upload an oversized image — should be rejected with a clear error
5. Upload a non-image file — should be rejected

**Verify**:
- Concurrent uploads don't interfere (each gets its own URL)
- Size limit enforced
- Type check enforced
- Returned URLs are accessible

**Pass criteria**: concurrent uploads work; limits enforced; URLs valid

---

## A10 — Auth (SIWE) under load
**Read first**: `apps/api/src/auth/auth.controller.ts`, `auth.service.ts`

**Steps**:
1. `GET /auth/nonce` — fire 100 requests concurrently. Each should return a unique nonce.
2. `POST /auth/verify` — submit valid SIWE signatures from 10 wallets concurrently. Each should return a token.
3. Reuse a nonce — should be rejected (nonce already consumed).
4. Submit an expired nonce — should be rejected.
5. Submit a tampered signature — should be rejected.

**Verify**:
- Nonces are unique even under concurrency
- Nonce consumption is atomic (no reuse race)
- Token returned on valid verify, clear error on invalid
- Expired/tampered rejected

**Pass criteria**: unique nonces; atomic consumption; valid/invalid handled correctly

---

## A11 — Redis pub/sub reliability
**Read first**: `apps/api/src/redis/redis.service.ts`, `websocket.gateway.ts`

**Steps**:
1. While running A1, monitor Redis:
   ```bash
   redis-cli PUBSUB CHANNELS
   redis-cli PUBSUB NUMSUB token:events
   redis-cli INFO clients
   ```
2. Restart Redis (`docker compose restart redis`) while API is running
3. Verify API reconnects and resumes pub/sub subscription
4. Trigger a buy — verify WS clients still receive the event after Redis restart

**Verify**:
- Redis handles the publish volume from indexer
- API reconnects after Redis restart (check logs for "subscribed" message)
- No events lost across the restart window (compare on-chain events to WS deliveries)
- WS clients auto-reconnect (check `useWebSocket.ts` behavior)

**Pass criteria**: Redis handles volume; reconnect works; no permanent event loss

---

# TESTER B — Functional Correctness, Financial Math, Every Endpoint, Every Page

**Your job: verify everything works correctly, end to end. Not load (that's Tester A).**
**Read every contract in `contracts/src/` and every controller in `apps/api/src/` before starting.**

## B1 — Launch flow (full happy path)
**Steps**:
1. `node scripts/e2e-full-flow.js` — launch → buy → sell. Must pass.
2. Manually launch a token via the frontend `/launch` page:
   - Fill in name, symbol, description, upload image, set initial buy amount
   - Submit — verify tx confirms, token appears on home page, indexer picks it up within 5s
3. Launch a token via the API directly (if there's a launch endpoint — check `tokens.controller.ts`)

**Verify**:
- Token created on-chain with correct params (name, symbol, total supply 1B, 88% on curve)
- `TokenFactory.getToken(token)` returns correct metadata
- Curve deployed with correct virtual reserves
- Token appears in `GET /tokens` response
- Token appears on frontend home + explore pages
- Image URL accessible
- Creator fee accrual starts at 0

**Pass criteria**: launch works via script, frontend, and API; token indexed; all data correct

---

## B2 — Buy flow (functional)
**Read first**: `BondingCurve.sol` lines 186–258

**Steps**:
1. On a launched token, buy 100 USDC worth
2. Verify:
   - `quoteBuy(100)` before the tx matches tokens received
   - `curve.realUsdc()` increased by 99 (100 - 1% fee)
   - `curve.creatorFeesAccrued()` increased by 0.5 USDC
   - `curve.protocolFeesAccrued()` increased by 0.5 USDC
   - `curve.tokensSold()` increased by tokens received
   - Buyer's token balance increased by tokens received
   - `Buy` event emitted with correct args
   - Trade appears in `GET /tokens/:address/trades`
   - Trade appears in frontend TradeHistory component
   - Holder count incremented in `GET /tokens/:address/holders`
   - Price + MC updated on frontend

**Pass criteria**: buy math exact; all state updates correct; indexer + frontend reflect the trade

---

## B3 — Sell flow (functional)
**Read first**: `BondingCurve.sol` lines 263–299

**Steps**:
1. On a token where you hold tokens, sell some
2. Verify:
   - `quoteSell(tokenAmount)` before the tx matches USDC received
   - `curve.realUsdc()` decreased by `usdcGross` (not `usdcOut` — fee is separate)
   - `curve.tokensSold()` decreased by tokenAmount
   - Fees accrued correctly (1% of `usdcGross`, 50/50 split)
   - Seller's token balance decreased
   - Seller's USDC balance increased by `usdcOut`
   - `Sell` event emitted with correct args
   - Trade appears in API + frontend
   - Holder count decremented if seller sold all

**Pass criteria**: sell math exact; state correct; indexed; frontend reflects

---

## B4 — Graduation boundary (exactly at $25K MC)
**Read first**: `BondingCurve.sol` lines 250–257, `LiquidityMigration.sol` lines 71–117

**Steps**:
1. Launch a token. Initial MC ~$4,000. Buy in small increments until MC = $24,990.
2. **Sub-test a**: Verify `curve.graduated()` is false. Curve still active.
3. **Sub-test b**: Buy the exact amount to reach MC = $25,000. Verify in the SAME tx:
   - `curve.graduated()` flips to true
   - `LiquidityMigration.checkAndMigrate` called
   - AMM pair created
   - LP tokens burned to `0x...dEaD`
   - `token.graduated()` = true (max-wallet + cooldown disabled)
4. **Sub-test c**: On a fresh token, buy a large amount jumping MC from $24,000 to $26,000. Verify graduation triggers, buyer gets tokens, no refund of tokens.

**Verify after graduation**:
- `curve.graduated()` == true
- `token.graduated()` == true
- `token.bondingCurve()` == `address(0)` (renounced)
- `token.owner()` == `address(0)` (ownership renounced)
- AMM pair exists: `ammFactory.getPair(token, USDC)` != `address(0)`
- LP tokens at `0x...dEaD` > 0
- `LiquidityMigration.tokenToAmmPair(token)` == AMM pair address
- Token balances: all user holdings + AMM pair + burned LP == 1B TOTAL_SUPPLY
- Curve USDC: `min(realUsdc, $8,500)` sent to migrator; remainder stays on curve
- Frontend coin page shows "Graduated" state, redirects trades to AMM

**Pass criteria**: graduation triggers exactly at threshold; atomic; balances conserved; frontend reflects

---

## B5 — Graduation via full sell-out (alternative trigger)
**Read first**: `BondingCurve.sol` line 255 (`tokensSold >= SUPPLY_ON_CURVE`)

**Steps**:
1. Use `e2e-graduation.js` (coordinate ~$9,000 USDC with Lead)
2. It buys in $100 chunks, transferring to throwaway addresses to stay under 4% max-wallet
3. Watch for the `tokensSold >= SUPPLY_ON_CURVE` (880M) graduation path

**Verify**: same post-graduation state as B4

**Pass criteria**: full-sellout graduation works; same state as MC-threshold

---

## B6 — 4% max-wallet limit
**Read first**: `MemeToken.sol` lines 25, 69–71, 96–104

**Steps**:
1. `maxWallet()` = 40M tokens (4% of 1B)
2. **Sub-test a**: Buy 39,999,999 tokens — succeed
3. **Sub-test b**: Buy exactly 40,000,000 — succeed (boundary, `>` is strict so equal allowed)
4. **Sub-test c**: Buy 40,000,001 in one tx — revert `MaxWalletExceeded`
5. **Sub-test d**: Buy 20M, then 21M more (total 41M) — revert
6. **Sub-test e — transfer bypass**: Wallet A buys 39M, transfers 20M to B, A buys 20M more (39M again), B transfers 20M back to A — A would have 59M, should revert (check is on receiver)
7. **Sub-test f — multi-wallet bypass**: A, B, C, D each buy 39M (156M total, all under 4% individually) — this is the documented bypass (D20), works by design. Log if you think it shouldn't.

**Verify**:
- Limit on holdings (receiver balance), not cumulative buys
- Enforced on user-to-user transfers, not just buys
- NOT enforced on sells (to curve exempt — `to != bondingCurve`)
- NOT enforced post-graduation

**Pass criteria**: limit at exactly 40M; single-wallet bypass attempts fail; multi-wallet bypass is expected

---

## B7 — Cooldown (30 blocks / ~15s)
**Read first**: `MemeToken.sol` lines 16–18, 85–94

**Steps**:
1. Wallet A buys tokens, transfers to B, then tries to transfer again within 30 blocks (~15s) — revert `CooldownActive`
2. Wait 30+ blocks, transfer again — succeed
3. Buy and sell rapidly — should work (curve exempt)
4. After graduation, transfer rapidly — should work (cooldown disabled)

**Verify**:
- Per-wallet (`lastTxBlock[msg.sender]`)
- Only user-to-user transfers
- Disabled post-graduation
- First-ever transfer has no cooldown (`lastTxBlock != 0` check)

**Pass criteria**: cooldown blocks rapid user transfers; doesn't block curve trades; off post-graduation

---

## B8 — Sell-when-illiquid / edge sells
**Read first**: `BondingCurve.sol` lines 263–299

**Steps**:
1. **Sell more than held**: `sell(1, 0)` with 0 balance — revert `InsufficientLiquidity` or `transferFrom` fails first (verify which)
2. **Sell 100%**: buy 10M, sell all 10M — verify `usdcOut` == `quoteSell(10M)`, balance 0, `tokensSold` decreased, `realUsdc` decreased by `usdcGross`
3. **Drain curve**: buy almost all tokens, try to sell — verify no underflow on `realUsdc`, clean revert if can't pay
4. **Sell 0**: `sell(0, 0)` — revert `InsufficientLiquidity`
5. **Sell after graduation**: `sell(...)` — revert `AlreadyGraduated`

**Verify**: all reverts BEFORE any state change; no underflow; no partial state corruption

**Pass criteria**: edge sells revert cleanly; no state corruption; no underflow

---

## B9 — Fee split math (MOST IMPORTANT)
**Read first**: `BondingCurve.sol` lines 191–201 (buy), 278–290 (sell), `Treasury.sol`

**Steps**:
1. Launch token. Note creator + treasury addresses.
2. **Single buy 100 USDC**: fee = 1 USDC, creator += 0.5, protocol += 0.5. Verify on-chain exact (6-dec: `500000` each).
3. **Single sell 100 USDC gross**: same split.
4. **1000 buys of 1 USDC**: total fee = 10 USDC, creator = 5, protocol = 5. Verify `creatorFeesAccrued + protocolFeesAccrued == 10` exactly. Check for dust from integer division (e.g., fee=3 → creator=1, protocol=2, not 1.5/1.5 — verify this is acceptable and documented).
5. **Claim creator fees**: `curve.claimCreatorFees()` — receives exact `creatorFeesAccrued`, resets to 0, goes to creator wallet.
6. **Claim protocol fees**: `curve.claimProtocolFees()` — receives exact `protocolFeesAccrued`, resets to 0, goes to treasury.
7. **Claim with 0 balance**: no revert, no transfer (early return).

**Verify**:
- `creatorFeesAccrued + protocolFeesAccrued == sum of all fees` (no dust lost)
- Claims transfer exact amounts, reset to 0
- Conservation: `curve.realUsdc + creatorFeesAccrued + protocolFeesAccrued == total USDC sent to curve`

**Pass criteria**: exact fee math; no dust loss; claims work; conservation holds

---

## B10 — Partial fill on buy (supply exhaustion)
**Read first**: `BondingCurve.sol` lines 210–244

**Steps**:
1. Buy until `tokensSold` is close to 880M (say 879M)
2. Buy with a large USDC amount that would exceed remaining 1M tokens
3. Verify:
   - `tokensOut` = remaining (1M), not more
   - Buyer gets USDC refund for excess
   - `tokensSold` == 880M after
   - Fee accruals adjusted to actual `usdcNeeded`, not original `usdcAmount` (lines 231–236 — original fee undone, correct fee accrued)
   - Refund goes to buyer

**Verify**: no USDC lost (refund + realUsdc + fees == original usdcAmount); `tokensSold` never exceeds 880M

**Pass criteria**: partial fill refunds correctly; fees adjusted; no funds lost; supply cap respected

---

## B11 — Rapid buy → sell → buy race
**Steps**:
1. **Same wallet, back-to-back**: buy → sell → buy as fast as possible. Each tx sees correct state from previous.
2. **Same block, different wallets**: A buys while B sells, both in same block. Both succeed (or one reverts on slippage, not both stuck). State after reflects both.
3. **Frontrun attempt**: submit a sell, then a buy from another wallet in same block trying to manipulate price. Verify slippage protection (`minTokensOut`/`minUsdcOut`) prevents user getting rekt.

**Pass criteria**: atomic transitions; slippage protection effective; no corruption

---

## B12 — Blocklisted address interaction
**Read first**: `BondingCurve.sol` lines 292–296, D5

**Steps**:
1. Blocklisted addr: `0x70997970C51812dc3A010C7d01b50e0d17dc79C8`
2. **Blocklisted buys**: `transferFrom` from blocklisted fails → clean revert, no state change
3. **Blocklisted sells**: if blocklisted holds tokens (transferred in), `sell()` — state updates at lines 285–290 BEFORE USDC transfer at 296. If transfer to blocklisted fails, WHOLE TX must revert (Solidity revert undoes state). **VERIFY THIS EXPLICITLY** — if state isn't reverted, it's Critical.
4. **Transfer to blocklisted**: non-blocklisted wallet transfers tokens to blocklisted — ERC-20 transfer may succeed (no USDC blocklist check in ERC-20), but blocklisted can never sell. Log if concerning.

**Pass criteria**: blocklisted blocked; failed transfers revert cleanly with no state corruption

---

## B13 — Reentrancy verification
**Read first**: `BondingCurve.sol` — NO `nonReentrant` modifier. Relies on CEI pattern.

**Steps**:
1. Deploy a malicious contract that re-enters `curve.buy()` or `curve.sell()` in the token/USDC transfer callback
2. **Reentrant buy**: in token transfer callback (when curve sends tokens to attacker), re-enter `buy()`. Verify reentrant buy sees UPDATED state (tokensSold already increased) — fair price, no exploit.
3. **Reentrant sell**: in USDC transfer callback, re-enter `sell()`. Verify sees updated `tokensSold`/`realUsdc`. Can't sell more than holds.

**Verify**: CEI holds (state updates before external calls); reentrant calls see correct state; no drain possible

**Pass criteria**: no reentrancy exploit; CEI verified

---

## B14 — Post-graduation AMM correctness
**Read first**: `LiquidityMigration.sol` lines 94–117, `AMMPair.sol`, `AMMFactory.sol`

**Steps**:
1. Run `e2e-graduation.js` (coordinate ~$9,000 USDC with Lead)
2. After graduation:
   - AMM pair reserves: 120M tokens + `min(realUsdc, $8,500)` USDC
   - LP tokens burned to `0x...dEaD` (verify `AMMPair.balanceOf(BURN_ADDRESS)`)
   - LP burn address is `0x...dEaD`, NOT `address(0)` (D8)
3. **Trade on AMM**: buy tokens (USDC → token), sell tokens (token → USDC). Verify AMM math (constant product, 0.3% fee — check `AMMPair.sol`).
4. **Curve frozen**: `curve.buy()` / `curve.sell()` → revert `AlreadyGraduated`
5. **Token renounced**: `token.owner()` == `address(0)`, `token.bondingCurve()` == `address(0)`. No admin functions callable.

**Verify**: AMM reserves correct; LP burned to correct address; curve frozen; token renounced; supply conserved (all holders + AMM + burned LP == 1B)

**Pass criteria**: AMM functional; curve frozen; token renounced; supply conserved

---

## B15 — Slippage protection
**Read first**: `BondingCurve.sol` lines 247 (buy), 282 (sell)

**Steps**:
1. `quoteBuy(100)` returns X. `buy(100, X+1)` → revert `SlippageExceeded`
2. `buy(100, X)` → succeed (equal allowed, `<` is strict)
3. `buy(100, 0)` → succeed (no protection)
4. Same for sells: `quoteSell(Y)` = Z. `sell(Y, Z+1)` reverts. `sell(Y, Z)` succeeds. `sell(Y, 0)` succeeds.

**Verify**: slippage check uses `<` (strict), equal allowed; reverts undo state (Solidity revert behavior)

**Pass criteria**: slippage protection at boundary; reverts clean

---

## B16 — Excess USDC sweep
**Read first**: `BondingCurve.sol` — search for `ExcessUsdcSwept` event (line 100) and sweep function

**Steps**:
1. After graduation, curve may hold excess USDC (`realUsdc - LP_SEED_USDC` if `realUsdc > $8,500`)
2. Owner sweeps excess — verify correct amount swept, fees untouched, only owner can sweep

**Pass criteria**: excess sweepable by owner only; fees untouched; correct amount

---

## B17 — Indexer vs on-chain consistency
**Steps**:
1. After any scenario above, once indexer catches up:
2. Compare on-chain views to DB rows:
   - `curve.realUsdc()` ↔ DB `tokens.real_usdc`
   - `curve.tokensSold()` ↔ DB `tokens.tokens_sold`
   - `curve.marketCap()` ↔ DB `tokens.market_cap`
   - `curve.price()` ↔ DB `tokens.price`
   - On-chain `Buy`/`Sell` events (via `eth_getLogs`) ↔ DB `trades` rows (count + values)
3. Run `node scripts/check-trades.js <token-addr>` and compare to on-chain event count

**Verify**: zero drift; no missing trades; no duplicates; numeric values match (watch 6-dec vs 18-dec conversion bugs)

**Pass criteria**: on-chain == DB; no missing/duplicate/incorrect rows

---

## B18 — Token list + stats endpoints
**Endpoints**: `GET /tokens`, `GET /tokens/stats`, `GET /tokens/:address`, `GET /tokens/:address/trades`, `GET /tokens/:address/holders`

**Steps**:
1. `GET /tokens` — verify pagination works, returns array of tokens with correct fields (name, symbol, address, market_cap, volume_24h, holder_count, price, image_url)
2. `GET /tokens/stats` — verify totals (total tokens, total volume, total USDC, graduated count)
3. `GET /tokens/:address` — verify detail matches on-chain state
4. `GET /tokens/:address/trades` — verify trade history, pagination, correct order (newest first or oldest first — check and confirm)
5. `GET /tokens/:address/holders` — verify holder list matches on-chain balances (compare to `token.balanceOf` for each)
6. **Error cases**: `GET /tokens/0xinvalid` → 404 or clear error. `GET /tokens/:address/trades` on a non-existent token → empty array or 404.

**Verify**: all fields use correct USDC formatter (6-dec micro-USDC for `real_usdc`/`usdc_amount`, dollars for `market_cap`/`volume_24h`); no 1e6× or 1e12× errors

**Pass criteria**: all endpoints return correct data; pagination works; error cases handled

---

## B19 — Leaderboard endpoint
**Endpoint**: `GET /leaderboard`

**Steps**:
1. `GET /leaderboard` — verify returns top tokens sorted by volume or market cap (check sort order)
2. Verify each entry has correct fields
3. Create activity (buys/sells) on a token — verify leaderboard updates after indexer catches up
4. Verify graduated tokens are excluded or marked (check behavior — should they appear?)

**Pass criteria**: correct sort order; updates with new activity; correct fields

---

## B20 — Favorites / watchlist
**Endpoints**: `GET /favorites`, `POST /favorites/:tokenAddress`, `DELETE /favorites/:tokenAddress`, `GET /favorites/:tokenAddress`

**Steps**:
1. **Auth required**: all favorites endpoints require auth — verify 401 without token
2. `POST /favorites/:tokenAddress` — add a token to watchlist. Verify 201.
3. `GET /favorites` — verify the token appears
4. `GET /favorites/:tokenAddress` — verify returns true (is favorited)
5. `POST /favorites/:tokenAddress` again — verify idempotent (no duplicate) or returns 409
6. `DELETE /favorites/:tokenAddress` — remove. Verify 200.
7. `GET /favorites/:tokenAddress` — verify returns false
8. `DELETE` again — verify idempotent or 404
9. **Frontend**: `/watchlist` page shows favorited tokens; FavoriteButton on coin page toggles correctly

**Verify**: auth enforced; CRUD works; idempotent; frontend reflects

**Pass criteria**: all CRUD works; auth enforced; frontend in sync

---

## B21 — Messages (token chat)
**Endpoints**: `GET /messages`, `POST /messages`

**Steps**:
1. `GET /messages?tokenAddress=0x...` — verify returns messages for a token (empty if none)
2. `POST /messages` — post a message (auth required). Verify 201, message appears in `GET`.
3. Post without auth — 401
4. Post with invalid token address — 404 or clear error
5. Post empty message — 400
6. Post very long message — verify length limit enforced
7. **Frontend**: TokenChat component on coin page shows messages, can post, updates in real-time (WS or polling)

**Verify**: auth enforced; messages persist; length limit; frontend shows + can post; real-time updates

**Pass criteria**: chat works end-to-end; auth enforced; limits enforced; real-time

---

## B22 — Token metadata
**Endpoints**: `GET /token-metadata`, `POST /token-metadata`

**Steps**:
1. `GET /token-metadata?tokenAddress=0x...` — verify returns metadata (social links, description) or empty
2. `POST /token-metadata` — set metadata (auth required — only token creator?). Verify 201.
3. Update metadata — verify overwrite works
4. Invalid token address — error
5. **Frontend**: coin page shows metadata (SocialLinks component, description)

**Pass criteria**: metadata CRUD works; auth enforced; frontend displays

---

## B23 — Users endpoint
**Endpoint**: `GET /users/:wallet`

**Steps**:
1. `GET /users/0x...` — verify returns user profile (stats, holdings, trade history)
2. Wallet with no activity — empty profile or zeros
3. Invalid wallet — 404 or error
4. **Frontend**: `/profile/[wallet]` page shows correct data

**Verify**: holdings match on-chain balances; trade history matches DB; stats (volume, P&L if computed) correct

**Pass criteria**: profile matches on-chain + DB; frontend displays correctly

---

## B24 — Auth (SIWE) flow
**Endpoints**: `GET /auth/nonce`, `POST /auth/verify`

**Steps**:
1. `GET /auth/nonce` — returns a nonce
2. Construct SIWE message, sign with wallet, `POST /auth/verify` — verify returns token
3. Use token for authenticated endpoints (favorites, messages) — verify works
4. **Replay**: reuse the same nonce — reject
5. **Expired**: wait for nonce expiry, submit — reject
6. **Tampered**: change signature — reject
7. **Wrong domain**: SIWE message with wrong domain — reject
8. **Frontend**: login button in Navbar works; logout works; auth state persists across page reloads

**Pass criteria**: full SIWE flow works; replay/expiry/tamper rejected; frontend auth works

---

## B25 — Image upload
**Endpoints**: `GET /upload/status`, `POST /upload/image`

**Steps**:
1. `GET /upload/status` — healthy
2. `POST /upload/image` with valid PNG — returns URL
3. URL is accessible
4. Oversized image — rejected
5. Non-image file — rejected
6. **Frontend**: ImageUploader component on `/launch` page works; preview shows; upload completes before launch submit

**Pass criteria**: upload works; limits enforced; frontend integrated

---

## B26 — Referrals
**Endpoints**: `POST /referrals/attribute`, `GET /referrals/leaderboard/top`, `GET /referrals/:wallet`, `GET /referrals/:wallet/referred`, `GET /referrals/:wallet/referrer`

**Steps**:
1. `POST /referrals/attribute` — attribute a referral (verify payload). Verify 201.
2. `GET /referrals/:wallet` — verify referral stats for a wallet
3. `GET /referrals/:wallet/referred` — list wallets referred by this wallet
4. `GET /referrals/:wallet/referrer` — who referred this wallet
5. `GET /referrals/leaderboard/top` — top referrers
6. **Frontend**: ReferralPanel component works; referral link generation; attribution on signup via `use-referral.ts`

**Pass criteria**: referral tracking works; attribution correct; leaderboard sorts; frontend integrated

---

## B27 — Agents module (full sweep)
**Read first**: `apps/api/src/agents/agents.controller.ts` (22 endpoints), `agents.service.ts`, `deployer.service.ts`, `template.service.ts`, `tip.service.ts`, `api-key.guard.ts`

**Steps**:
1. **Auth**: all `/agents/*` endpoints require API key (`api-key.guard.ts`) — verify 401 without key
2. `POST /agents/register` — register an agent. Verify 201, returns agent ID + API key.
3. `GET /agents/me` — verify returns agent profile (with API key)
4. `GET /agents/me/launches` — verify returns tokens launched by this agent
5. `GET /agents/me/trades` — verify returns trades by this agent
6. `POST /agents/launch` — agent launches a token. Verify token created on-chain, indexed.
7. `POST /agents/tokens/:address/buy` — agent buys. Verify trade executes.
8. `POST /agents/tokens/:address/sell` — agent sells. Verify.
9. `POST /agents/tokens/:address/messages` — agent posts a message. Verify appears in chat.
10. `POST /agents/tokens/:address/metadata` — agent sets metadata. Verify.
11. `GET /agents` — list all agents. Verify pagination.
12. `GET /agents/:agentId` — agent detail.
13. `GET /agents/:agentId/launches` — tokens by agent.
14. `GET /agents/:agentId/activity` — agent activity feed.
15. `GET /agents/leaderboard` — top agents.
16. `POST /agents/:agentId/tip` — tip an agent. Verify USDC transfer + record.
17. `GET /agents/:agentId/tips` — tips received by agent.
18. `GET /agents/templates` — list templates.
19. `GET /agents/templates/:id` — template detail.
20. `POST /agents/templates` — create template (auth).
21. `POST /agents/templates/:id/deploy` — deploy from template.
22. `GET /agents/deployer/balance` — deployer wallet USDC balance.
23. `POST /agents/deployer/approve` — approve USDC for a curve.

**Verify**:
- API key auth enforced on all endpoints
- Agent launches actually create on-chain tokens
- Agent buy/sell executes real trades (verify on-chain)
- Tipping transfers USDC correctly
- Deployer balance accurate
- Frontend `/agents` and `/agents/[agentId]` pages display correct data

**Pass criteria**: all 22 endpoints work; auth enforced; on-chain actions real; frontend displays

---

## B28 — Frontend pages (every page loads + functions)
**Test each page in the browser. For each: page loads without errors, data displays correctly, no console errors, no broken links.**

| Page | URL | What to verify |
|---|---|---|
| Home | `/` | LiveTicker updates, TokenGrid shows tokens, links work |
| Explore | `/explore` | All tokens list, pagination, search (SearchBar) |
| Launch | `/launch` | Form works, image upload, wallet connected, wrong-network detection, launch tx succeeds |
| Coin | `/coin/[address]` | TradePanel works (buy/sell), PriceChart renders, HoldersPanel correct, TokenChat works, TradeHistory loads, FavoriteButton toggles, ShareButton works, SocialLinks display, graduation state shown if graduated |
| Leaderboard | `/leaderboard` | Sorts correctly, updates with activity |
| Watchlist | `/watchlist` | Shows favorited tokens (auth required — redirect to login if not authed) |
| Profile | `/profile/[wallet]` | Holdings, trade history, correct formatting |
| Agents | `/agents` | Agent list loads |
| Agent detail | `/agents/[agentId]` | Agent profile, launches, activity |
| Fees | `/fees` | Fee structure displayed correctly (1% fee, 50/50 split, $25K graduation, $8,500 LP seed) |
| Docs | `/docs` | Loads |
| Blog | `/blog` | Loads |
| Legal | `/legal/terms`, `/legal/privacy-policy`, `/legal/dmca-policy`, `/legal/trademark-guidelines`, `/legal/tokenized-agent-disclaimer` | All load |
| 404 | `/nonexistent` | not-found.tsx renders |
| Error | (trigger error) | error.tsx renders |

**Verify on every page**:
- No console errors
- No broken images
- USDC values use correct formatter (no 1e6× or 1e12× errors)
- Mobile responsive (resize browser)
- Navbar works (links, wallet connect, wrong-network button)
- Footer links work

**Pass criteria**: all 15+ pages load; data correct; no console errors; mobile responsive

---

## B29 — Frontend USDC formatting (the #1 bug source)
**Read first**: `apps/web/src/lib/utils.ts` header comment

**Steps**:
1. On every page that displays USDC, verify the value is reasonable (not $0 for a token with volume, not $4,000,000,000 for a $4K MC token)
2. **Coin page**: market cap, price, volume, real USDC in curve, creator fees, protocol fees — each should use the right formatter
3. **Home/explore**: market cap, volume_24h — should be in dollars (no /1e6)
4. **Trade panel**: buy/sell amounts — micro-USDC (/1e6) for input, dollars for display
5. **Profile**: holdings value, trade history amounts
6. **Navbar**: wallet balance — native USDC (/1e18)

**Common bugs to look for**:
- `market_cap` shown as $25,000,000,000 instead of $25,000 (used `formatUsdc` instead of `formatUsdDirect`)
- Wallet balance showing $0 (used `formatUsdc` on native balance instead of `formatNativeUsdc`)
- Token amounts showing 1e18× too big (forgot `formatTokens`)

**Pass criteria**: every USDC value on every page uses the correct formatter

---

## B30 — Search
**Component**: `SearchBar.tsx`

**Steps**:
1. Search for a token by name — verify results
2. Search by symbol — verify
3. Search by contract address — verify
4. Search for non-existent — verify empty state
5. Empty search — verify no crash
6. Special characters in search — verify no crash

**Pass criteria**: search works by name/symbol/address; edge cases handled

---

## B31 — LiveTicker + real-time updates
**Components**: `LiveTicker.tsx`, `useWebSocket.ts`

**Steps**:
1. Open home page, watch LiveTicker
2. Trigger a buy/sell on any token (via script or UI)
3. Verify LiveTicker updates within 5s of on-chain confirmation
4. Open coin page, watch PriceChart + TradeHistory
5. Trigger a trade — verify both update in real-time
6. Disconnect network briefly — verify WS reconnects (check `useWebSocket.ts` auto-reconnect)
7. Close laptop / background tab — verify reconnect on resume

**Pass criteria**: real-time updates flow; WS reconnects; no stale data

---

## B32 — Conservation of funds (end-to-end invariant)
**The single most important test. Run after every other scenario.**

**Steps**:
1. After any sequence of buys/sells/graduations, verify:
   - `curve.realUsdc + curve.creatorFeesAccrued + curve.protocolFeesAccrued + sum(all USDC refunds) == sum(all USDC sent by buyers)`
   - `sum(all token balances across all wallets + curve + AMM + burned LP) == TOTAL_SUPPLY (1B)`
2. After graduation:
   - `AMM pair USDC + curve remaining USDC + creator fees claimed + protocol fees claimed + sum(user USDC balances) == sum(all USDC ever sent to the system)`
3. Compare on-chain to DB to frontend — all three must agree

**Pass criteria**: funds conserved exactly; on-chain == DB == frontend

---

## 4. Findings log

Append findings here as you find them. Number sequentially (F1, F2, ...). Don't delete — even fixed ones stay for the record.

<!-- Example:
### F1 — Indexer skips events under burst load
- Severity: High
- Found by: A
- Date: 2026-07-24
- Scenario: A5-indexer-lag
- Repro:
  1. Launch token 0x...
  2. Fire 50 buys from 10 wallets in 10s
  3. Compare on-chain event count to DB trades count
- Expected: 50 trades in DB
- Actual: 47 trades in DB; 3 events missing
- Evidence: tx hashes 0x..., 0x..., 0x... present on-chain but no DB rows
- Status: Open
-->

(no findings yet)
