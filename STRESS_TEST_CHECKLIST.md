# Stress Test Checklist — Orba

Print this. Tick boxes as you go. Date + initial each row when done.
Anything that fails → log in `STRESS_TEST_PLAYBOOK.md` "Findings log" before moving on.

**Tester A** = load/scale/infra · **Tester B** = functional/financial/every endpoint

---

## Setup (both — before anything)

- [ ] Env working: `npm install` + `cp .env.example .env` filled in ______ (date)
- [ ] `node scripts/check-balance.js <wallet>` returns USDC ______
- [ ] `node scripts/e2e-full-flow.js` passes (~30s) ______
- [ ] Have 2–3 funded testnet wallets (NOT deployer wallet) ______
- [ ] Local stack runs: `docker compose up -d` + `apps/api` + `apps/web` ______

---

## TESTER A — Load / Scale / Infrastructure

### A1 — Concurrent buys on single curve
- [ ] 5–10 wallets fire buys for 60s ______
- [ ] All valid buys succeeded (slippage/maxwallet reverts OK) ______
- [ ] Funds conserved: `realUsdc + fees == sum USDC sent` ______
- [ ] `tokensSold == sum tokens received` ______
- [ ] Indexer caught up <30s ______
- [ ] No DB deadlocks ______
- [ ] RPC rotation handled `-32011` ______

### A2 — Concurrent buys + sells (mixed)
- [ ] 5 buying + 5 selling simultaneously, 60s ______
- [ ] State consistent after all txs settle ______
- [ ] No double-spend (can't sell more than held) ______
- [ ] Indexer event order matches chain ______

### A3 — WebSocket flood + per-IP limit
- [ ] 6th connection from one IP rejected (limit=5) ______
- [ ] 100+ connections across IPs alive 5min ______
- [ ] Events delivered to all <5s after on-chain confirm ______
- [ ] No message loss (on-chain count == WS received) ______
- [ ] No memory leak ______
- [ ] Dead connections cleaned within ~25s (heartbeat) ______

### A4 — RPC rate-limit exhaustion
- [ ] Ramped reads 10/s → 200/s over 2min ______
- [ ] Proxy rotates providers on `-32011` ______
- [ ] Client error rate <1% until all 4 providers exhausted ______
- [ ] All 4 exhausted → clear error (not hang) ______
- [ ] Indexer poller rotates independently ______
- [ ] Write methods rejected 403 (`eth_sendRawTransaction`, `eth_sendTransaction`, `personal_sign`, `eth_sign`) ______

### A5 — Indexer lag under sustained load
- [ ] 10min continuous buys ______
- [ ] Lag <30s throughout ______
- [ ] Catches up <60s after stop ______
- [ ] Zero missed events (on-chain count == DB count) ______
- [ ] Zero duplicate tx hashes in DB ______

### A6 — DB write contention
- [ ] Ran A1 while monitoring `pg_stat_activity` + `pg_locks` ______
- [ ] No deadlocks ______
- [ ] No locks held >1s ______
- [ ] No connection pool exhaustion ______

### A7 — Frontend under load
- [ ] 3+ tabs open while A1 runs ______
- [ ] Balances display (not $0) ______
- [ ] Quotes load ______
- [ ] Trade submissions surface errors clearly ______
- [ ] Receipt polling works (warnings OK, hangs not) ______
- [ ] Wrong-network button appears on wrong chain ______
- [ ] LiveTicker + PriceChart update real-time ______

### A8 — Long-running stability (1 hour)
- [ ] 1 buy + 1 sell / 2s for 1 hour ______
- [ ] API memory flat (no leak) ______
- [ ] DB connections bounded ______
- [ ] Indexer lag bounded (no upward drift) ______
- [ ] No restart needed ______
- [ ] Redis pub/sub healthy throughout ______

### A9 — Image upload under load
- [ ] `GET /upload/status` healthy ______
- [ ] 10 concurrent uploads → each gets URL ______
- [ ] URLs accessible ______
- [ ] Oversized rejected ______
- [ ] Non-image rejected ______

### A10 — Auth (SIWE) under load
- [ ] 100 concurrent `GET /auth/nonce` → all unique ______
- [ ] 10 concurrent valid `POST /auth/verify` → all get tokens ______
- [ ] Nonce reuse rejected ______
- [ ] Expired nonce rejected ______
- [ ] Tampered signature rejected ______

### A11 — Redis pub/sub reliability
- [ ] Redis handles publish volume during A1 ______
- [ ] Restarted Redis mid-traffic → API reconnects ______
- [ ] No permanent event loss across restart ______
- [ ] WS clients auto-reconnect ______

---

## TESTER B — Functional / Financial / Every Endpoint

### Contracts
- [ ] **B1** Launch flow (script + frontend + API) ______
- [ ] **B2** Buy flow (math exact, state, indexed, frontend) ______
- [ ] **B3** Sell flow (math exact, state, indexed, frontend) ______
- [ ] **B4** Graduation boundary (exactly $25K MC) ______
- [ ] **B5** Graduation via full sell-out (needs ~$9K USDC) ______
- [ ] **B6** 4% max-wallet (boundary 40M, bypass attempts) ______
- [ ] **B7** Cooldown 30 blocks (~15s) ______
- [ ] **B8** Sell-when-illiquid / edge sells ______
- [ ] **B9** Fee split math (1 buy, 1 sell, 1000 small, claims, 0-claim) ______
- [ ] **B10** Partial fill on supply exhaustion (refund + fee adjust) ______
- [ ] **B11** Rapid buy→sell→buy race (same + cross wallet) ______
- [ ] **B12** Blocklisted address (buy/sell/transfer) — **verify sell reverts cleanly** ______
- [ ] **B13** Reentrancy (malicious contract, CEI holds) ______
- [ ] **B14** Post-graduation AMM (reserves, LP burn, frozen, renounced) ______
- [ ] **B15** Slippage protection (boundary, `<` strict) ______
- [ ] **B16** Excess USDC sweep (owner-only, fees untouched) ______
- [ ] **B17** Indexer vs on-chain consistency (zero drift) ______

### API endpoints
- [ ] **B18** Token list + stats + detail + trades + holders ______
- [ ] **B19** Leaderboard (sort, updates) ______
- [ ] **B20** Favorites CRUD (auth, idempotent, frontend) ______
- [ ] **B21** Messages/chat (auth, length limit, real-time) ______
- [ ] **B22** Token metadata (CRUD, auth, frontend) ______
- [ ] **B23** Users endpoint (profile matches on-chain + DB) ______
- [ ] **B24** SIWE auth flow (replay/expiry/tamper rejected, frontend) ______
- [ ] **B25** Image upload (limits, frontend) ______
- [ ] **B26** Referrals (attribution, leaderboard, frontend) ______
- [ ] **B27** Agents module — all 22 endpoints (auth, on-chain real, frontend) ______

### Frontend (every page)
- [ ] **B28a** Home `/` ______
- [ ] **B28b** Explore `/explore` ______
- [ ] **B28c** Launch `/launch` ______
- [ ] **B28d** Coin `/coin/[address]` ______
- [ ] **B28e** Leaderboard `/leaderboard` ______
- [ ] **B28f** Watchlist `/watchlist` ______
- [ ] **B28g** Profile `/profile/[wallet]` ______
- [ ] **B28h** Agents `/agents` ______
- [ ] **B28i** Agent detail `/agents/[agentId]` ______
- [ ] **B28j** Fees `/fees` ______
- [ ] **B28k** Docs `/docs` ______
- [ ] **B28l** Blog `/blog` ______
- [ ] **B28m** Legal (terms, privacy, DMCA, trademark, disclaimer) ______
- [ ] **B28n** 404 page renders ______
- [ ] **B28o** Error page renders ______
- [ ] **B28p** Mobile responsive on all pages ______
- [ ] **B28q** No console errors on any page ______

### Frontend correctness
- [ ] **B29** USDC formatting correct on every page (no 1e6×/1e12× bugs) ______
- [ ] **B30** Search (name, symbol, address, empty, special chars) ______
- [ ] **B31** LiveTicker + real-time WS updates + reconnect ______

### Final invariant
- [ ] **B32** Conservation of funds: `realUsdc + fees + refunds == sum USDC sent` ______
- [ ] **B32** Conservation of tokens: `all balances + curve + AMM + burned LP == 1B` ______
- [ ] **B32** On-chain == DB == frontend (all three agree) ______

---

## Sign-off

**Tester A — completed:** ______ (date) ______ (initials)
**Tester B — completed:** ______ (date) ______ (initials)
**Lead — reviewed findings:** ______ (date) ______ (initials)
**Mainnet go/no-go:** ______ (date) ______ (decision)

**Mainnet cannot ship until:**
- All Critical findings resolved
- All High findings resolved or explicitly accepted by Lead
- Audit closed
- B32 (conservation of funds) passes
