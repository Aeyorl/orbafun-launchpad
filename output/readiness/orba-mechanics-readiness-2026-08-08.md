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
| API tests | PASS | 28/28, including liveness/readiness behavior |
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
- Requested 100-user stage: only 62 temporary wallets could be funded before the deployer exhausted its testnet gas balance
- Actual burst: 62/62 buys, zero reverts, 4.30 tx/s, average 10.99 seconds, max 14.39 seconds, consistent state
- Indexer: 61/62 within 120 seconds; the final trade appeared later, producing 74/74 total rows

**Result: PASS at 62 simultaneous traders; 100 simultaneous traders remains unproven because setup funding stopped at 62.**

## Resolved in source, awaiting deployment verification

1. TradingView history now merges the page's already-loaded candles with its own cold history request, sorts/deduplicates bars, and rejects malformed values. Targeted tests pass, and a clean deployed-browser capture shows OHLC candles and volume rendered with `Live` status.
2. WebSocket status now distinguishes initial `Connecting` from a genuine post-disconnect `Reconnecting` state. A clean production browser showed `Live`; the earlier hydration/provider errors reproduced only in a browser profile with conflicting wallet extensions.
3. Image upload copy and client validation now exactly match the API: PNG, JPEG, GIF, or WebP only.
4. `nanoid` was upgraded to 3.3.17. Production and full development dependency audits now report zero vulnerabilities.
5. Added `/health` liveness and `/health/ready` dependency readiness endpoints with PostgreSQL and Redis checks; API tests and build pass.
6. The 100-wallet harness now preflights transfer value plus estimated funding fees, writes a gitignored recovery file before funding, and aborts rather than relabeling a partial funding run as a 100-user test.

## Remaining mainnet blockers

1. Set `POSTGRES_SSL_CA_BASE64` from the Supabase Database Settings CA and rerun `node scripts/check-infrastructure-readiness.js`. Strict local verification currently fails closed; Redis independently passes PING and TTL write/read/delete.
2. Fund enough Arc testnet USDC for all 100 wallets and rerun the hardened load test. Capacity is proven at 62 simultaneous traders, not yet 100 distinct funded wallets.
3. Complete an independent credentialed smart-contract/security audit before meaningful mainnet funds.
4. When Arc mainnet operator endpoints are available, provision redundant RPCs, deploy the audited contract set, transfer every owner role to the Safe, configure the mainnet environment, and rerun the full launch/buy/sell/graduation checks. Testnet success is not evidence of a completed mainnet deployment.

## Test harness changes

- E2E script now uses configured current contracts, deployed API, and official `.arc.network` RPC defaults.
- Load test now treats Arc native/6-decimal USDC as one asset and no longer double-funds wallets.
- Load test now fails if it funds fewer users than requested, state verification fails, or the indexer misses the deadline.
- Load test now includes funding-gas preflight and a private-key recovery artifact ignored by Git.
- Added reproducible live metadata, HTTP capacity, contract ownership, and infrastructure readiness scripts.
