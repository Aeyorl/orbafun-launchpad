# Orba Mechanics and Capacity Readiness — 2026-08-08

## Verdict

**Testnet core mechanics: PASS. Mainnet launch readiness: NO-GO pending the blockers below.**

## Functional evidence

| Area | Result | Evidence |
|---|---|---|
| Smart contracts | PASS | Foundry: 40/40 tests across AMMRouter, BondingCurve, and Arc fork integration |
| Contract deployment | PASS | TokenFactory, Treasury, Migrator, and AMMFactory all have bytecode on chain 5042002 |
| Contract ownership | PASS | All four configured Ownable contracts report Safe `0x33E4bd4561EE669012ff83b4eE5609122838bDcB` |
| Create coin | PASS | Token `0x24797f2c26b35d811c985c7c3c96d7c823c7cc3b`, curve `0x45fc48c6746db90a3b8689e71724258cf5e16189` |
| Create indexing | PASS | Launch appeared in the public API in 5 seconds |
| Buy | PASS | Tx `0x6d02ce50595bf2c6e0416433856608a384a6e47727c1fc3815161cfc48cf6a4f`, indexed in 6.6 seconds |
| Sell | PASS | Tx `0xacb58b1c552810330cb7c929f61976b9608c62599f1cb94d9bca0652ae7910ac`, indexed in 6.6 seconds |
| Image upload | PASS | Pinata URI `ipfs://QmfZnKiwY1ZUvE2doJjkxXLQtCLdQi1EPtFy4e5xUMDCmV`, gateway retrieval successful |
| Links and description | PASS | Website, Twitter handle, Telegram, Discord, description, and banner survived authenticated creator-only write/read |
| PostgreSQL through API | PASS | Launch, 74 trades, and metadata persisted and read back; deployed `/health/ready` reports PostgreSQL ready |
| Redis | PASS | PING plus namespaced TTL write/read/delete round trip; deployed `/health/ready` reports Redis ready |
| WebSocket transport | PASS | Live Socket.IO WebSocket connection and token room join succeeded |
| Frontend tests | PASS | 110/110, including TradingView cold-history fallback and buy approval/receipt flow |
| API tests | PASS | 29/29, including liveness/readiness and burst cache coalescing behavior |
| Builds | PASS | API build and Next.js production webpack build passed; 18 app pages generated |
| Production dependencies | PASS | `npm audit --omit=dev`: 0 vulnerabilities; full development audit: 0 vulnerabilities |

## Capacity results

### Browsing/API users

- 100 concurrent virtual users
- 300 mixed requests across home, explore, trade page, token, trades, candles, and metadata
- 300/300 HTTP 200; 100% success
- 75.82 requests/second after deployment
- latency: p50 589.0 ms, p95 2555.2 ms, p99 2632.0 ms

**Result: PASS for 100 concurrent browsing/API users, with p95 latency worth improving.**

### Simultaneous on-chain buyers

- 10-user stage: 10/10 buys, zero reverts, 0.92 tx/s, consistent state, indexed in 20.68 seconds
- First 100-wallet stage: 100/100 buys, zero reverts, 3.47 tx/s, average 20.33 seconds, max 28.84 seconds, consistent state
- Before optimization, the indexer reached 71/100 in 120 seconds and all 100 in about 194 seconds
- Indexer optimization removed the per-trade readback and debounced repeated cache-pattern scans without changing ordered financial transactions
- Repeat 100-wallet stage: 89/100 reached chain, zero reverts, consistent state; 11 failed before a tx hash due to public testnet RPC timeouts
- Optimized indexer: all 89 successful trades appeared in 55.92 seconds

**Result: PASS for 100 distinct simultaneous traders at the contract/application layer. Public testnet RPC reliability is variable at this burst size and requires production-grade redundant endpoints for mainnet.**

## Resolved in source, awaiting deployment verification

1. TradingView history now merges the page's already-loaded candles with its own cold history request, sorts/deduplicates bars, and rejects malformed values. Targeted tests pass, and a clean deployed-browser capture shows OHLC candles and volume rendered with `Live` status.
2. WebSocket status now distinguishes initial `Connecting` from a genuine post-disconnect `Reconnecting` state. A clean production browser showed `Live`; the earlier hydration/provider errors reproduced only in a browser profile with conflicting wallet extensions.
3. Image upload copy and client validation now exactly match the API: PNG, JPEG, GIF, or WebP only.
4. `nanoid` was upgraded to 3.3.17. Production and full development dependency audits now report zero vulnerabilities.
5. Added `/health` liveness and `/health/ready` dependency readiness endpoints with PostgreSQL and Redis checks; API tests and build pass.
6. The 100-wallet harness now preflights transfer value plus estimated funding fees, writes a gitignored recovery file before funding, and aborts rather than relabeling a partial funding run as a 100-user test.

## Remaining mainnet blockers

1. Set `POSTGRES_SSL_CA_BASE64` from the Supabase Database Settings CA and rerun `node scripts/check-infrastructure-readiness.js`. Strict local verification currently fails closed; Redis independently passes PING and TTL write/read/delete.
2. Complete an independent credentialed smart-contract/security audit before meaningful mainnet funds.
3. When Arc mainnet operator endpoints are available, provision redundant production-grade RPCs, deploy the audited contract set, transfer every owner role to the Safe, configure the mainnet environment, and rerun the full launch/buy/sell/graduation checks. Testnet success is not evidence of a completed mainnet deployment.

## Test harness changes

- E2E script now uses configured current contracts, deployed API, and official `.arc.network` RPC defaults.
- Load test now treats Arc native/6-decimal USDC as one asset and no longer double-funds wallets.
- Load test now fails if it funds fewer users than requested, state verification fails, or the indexer misses the deadline.
- Load test now includes funding-gas preflight and a private-key recovery artifact ignored by Git.
- Load test can reuse its recovery file and tops up only wallets below the requested balance.
- Added reproducible live metadata, HTTP capacity, contract ownership, and infrastructure readiness scripts.
