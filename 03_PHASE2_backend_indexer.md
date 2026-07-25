# Phase 2 — Backend + Indexer

**Gate to enter:** Phase 1 done, all 7 contracts deployed and tested on testnet.
**Gate to exit:** indexer correctly tracks a full token lifecycle (launch → trades → graduation) in the DB, API serves that data correctly, websocket events fire in real time, monitoring is in place.

---

## 1. Database schema

```sql
-- users
id, wallet (unique), username, avatar, created_at

-- tokens
id, contract_address (unique), creator_wallet, name, symbol, description,
image, market_cap, price, volume_24h, status (enum: active, graduated, paused),
created_at

-- trades
id, wallet, token_id (fk), type (enum: buy, sell), amount, price, tx_hash, timestamp
```

Indexes: `tokens.status`, `tokens.market_cap` (for sort/filter on Explore page),
`trades.token_id + timestamp` (for chart queries), `trades.wallet` (for portfolio page).

Note: `volume_24h` lives here in the DB, not on-chain. It's computed from the
trades table (rolling 24h window), not stored as contract state.

Comments table is removed — comments are cut from v1 (see master plan).

---

## 2. Indexer approach (use Envio or Goldsky — do NOT build from scratch)

Use a managed indexing service for event decoding, reorg handling, and
resumability. Build only the application layer on top.

### Recommended: Envio HyperIndex

- Write a HyperIndex config that decodes `TokenCreated`, `Buy`, `Sell`,
  `Graduated` events from our 7 contracts.
- Envio handles block tracking, reorgs (not that Arc has them — deterministic
  finality, N=1), and resumability on restart.
- Exposes a GraphQL API for querying, or stream live events to your backend.

### Fallback: Goldsky Subgraphs + Mirror

- Write a subgraph manifest for the same events.
- Use Goldsky Mirror to stream decoded events directly into your Postgres.
- Subgraph query engine for historical data.

### Application layer (build this regardless of indexer choice)

```
Envio/Goldsky decoded events
        ↓
Write to Postgres (trades, tokens updates) — via Mirror stream or webhook from indexer
        ↓
Update Redis cache (latest price, market cap per token)
        ↓
Publish to Redis Pub/Sub channel
        ↓
API's websocket layer relays to connected clients
```

### EIP-7708 dual Transfer event filtering (critical — read before writing indexer config)

Arc emits USDC `Transfer` events from **two** emitters:

| Emitter | Address | Decimals | When emitted |
|---|---|---|---|
| Native system (EIP-7708) | `0xfffffffffffffffffffffffffffffffffffffffe` | 18 | Every USDC movement (native + ERC-20) |
| ERC-20 USDC (NativeFiatToken) | `0x3600000000000000000000000000000000000000` | 6 | Only ERC-20 interface activity |

**A single ERC-20 `transfer()` emits TWO logs** — one from each emitter. A
native send emits only the system log.

Indexer config rules:
- **Filter on the native system emitter (`0xffff...fe`, 18 dec) only** as the
  single source of truth for USDC movements. Ignore the ERC-20 emitter's logs
  to avoid double-counting.
- **Standardize on 18 decimals internally** in the DB and API. Convert to 6
  decimals only at display boundaries if needed.
- **Never mix 6-dec and 18-dec values** in any calculation.

### Gas fees and block rewards (not Transfer events)

Gas fees and block rewards are **not** emitted as `Transfer` events. If fee
reconciliation is ever needed (e.g. treasury revenue tracking):
- Gas fees: derive from receipts (`gasUsed × effectiveGasPrice`).
- Block rewards: attributed via `block.miner`.

Do not try to reconcile treasury inflow by summing Transfer events — you'll
get a discrepancy.

### Reorg handling

Arc has deterministic, instant finality (N=1 confirmation). Traditional reorg
handling is unnecessary. Envio/Goldsky handle this regardless, but don't add
custom N-confirmation waiting logic — it's not needed and adds latency.

---

## 3. API endpoints

```
GET  /tokens                    ?sort=newest|market_cap|volume&status=active|graduated
GET  /tokens/:address
GET  /tokens/:address/trades     (paginated, for chart + transaction list)
GET  /users/:wallet              (portfolio, launched tokens, PnL)
GET  /leaderboard                (top creators, top gainers)
```

Comment endpoints are removed — comments are cut from v1.

---

## 4. WebSocket events

```
NEW_TOKEN        { token }
NEW_BUY          { token_id, trade }
NEW_SELL         { token_id, trade }
TOKEN_GRADUATED  { token_id }
```

`NEW_COMMENT` event is removed — comments are cut from v1.

Clients subscribe per-token (for the coin page) and globally (for the live
feed on the landing page) — support both subscription scopes from day one,
retrofitting scoped subscriptions later means reworking the pub/sub channel
structure.

---

## 5. Monitoring & alerting (build alongside the indexer, not at launch)

- [ ] Indexer lag metric: how far behind the chain tip is the indexed data?
    Alert if lag exceeds `[CONFIRM]` threshold (e.g. 10 blocks).
- [ ] Contract event-rate alert: spikes in `TokenCreated` or `Buy` events
    (possible viral token or possible attack).
- [ ] RPC health check: is the Arc RPC endpoint responding? Alert on
    elevated error rates or latency.
- [ ] DB size growth: track daily growth rate, alert on unexpected spikes
    (possible event storm or bug causing duplicate rows).
- [ ] WebSocket connection count: track active connections, alert on sudden
    drops (possible frontend issue) or spikes (possible bot activity).
- [ ] Indexer crash/restart alert: if using Envio/Goldsky, monitor their
    status; if self-hosting any component, monitor process health.

Use a simple monitoring stack (e.g. Prometheus + Grafana, or a managed
solution like the one Alchemy/QuickNode provide for their RPC). Don't build
custom alerting infrastructure — use existing tools.

---

## 6. Definition of done

- [ ] Indexer (Envio or Goldsky) correctly replays a full testnet token lifecycle into the DB (create, N trades, graduation) with no missed events
- [ ] Indexer resumes correctly after a forced restart mid-stream (verify Envio/Goldsky handles this, test it)
- [ ] EIP-7708 Transfer events filtered correctly — no double-counting, 18-dec standardization verified
- [ ] All API endpoints return correct data matching on-chain state
- [ ] WebSocket events fire within a few seconds of the underlying on-chain event
- [ ] Monitoring dashboard live with at least the 6 metrics above
- [ ] At least one alert rule tested (trigger it manually, verify it fires)
