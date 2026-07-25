# Orba

> The first pump.fun-style memecoin launchpad on **Arc** — Circle's USDC-native L1.
> Launch tokens against a USDC bonding curve. Graduate to an AMM. No ETH, no wrapped gas token, no surprises.

Orba lets anyone launch a token in seconds and trade it on a deterministic bonding curve denominated
entirely in USDC. When a token's curve reaches the graduation threshold, liquidity is migrated
atomically to a Uniswap-V2-style AMM, LP tokens are burned, ownership is renounced, and the bonding
curve is retired — a fully on-chain anti-rug graduation flow.

Arc is the venue because USDC is the **native gas token**: fees are stable and predictable, finality
is sub-second, and there's no second asset to bridge or wrap. Every price you see is in dollars.

---

## Highlights

- **USDC-native everything.** Bonding curve, gas, tips, referrals, agent spending limits — all USDC.
  No WETH, no native-token price volatility, no L1 fee spikes.
- **Pump.fun mechanics, audited internals.** Linear bonding curve with a 1% trade fee, $25,000
  graduation market cap, automatic AMM migration, LP burn, and ownership renunciation.
- **AI agent–launched tokens.** Registered agents authenticate with API keys and launch tokens
  through a platform-funded deployer wallet, with per-agent daily/monthly spending limits.
- **Live, real-time.** A direct Arc RPC poller indexes launch/buy/sell events in ~5s and fans them
  out via Redis pub/sub → Socket.IO to every connected client.
- **Browser-shield-proof.** All wagmi reads route through a same-origin JSON-RPC read proxy on the
  API, with server-side rotation across all four Arc RPC providers. Ad-blockers and Brave shields
  can't silently break the dApp.
- **Hardened.** Two rounds of self-audit (reentrancy guards, constant-time webhook secret compare,
  `SELECT FOR UPDATE` on spending limits, magic-byte image validation, BigInt validation, replay
  prevention on tips). Load-tested to 25 concurrent buys with zero reverts.

---

## How it works

```
                        ┌──────────────┐
   launch token ──────▶ │  TokenFactory│ ──▶ MemeToken + BondingCurve deployed
                        └──────────────┘
                                │
                                ▼
                   ┌────────────────────────┐
                   │   BondingCurve (USDC)  │  buy / sell against the curve
                   │   1% fee → Treasury    │  1% of every trade
                   └────────────────────────┘
                                │  market cap reaches $25,000
                                ▼
                   ┌────────────────────────┐
                   │  LiquidityMigration    │  atomic, in one tx:
                   │  (checkAndMigrate)     │  • create AMM pair
                   └────────────────────────┘  • add liquidity
                                │              • burn LP tokens → 0x…dEaD
                                ▼              • renounce token ownership
                   ┌────────────────────────┐  • mark curve graduated
                   │   AMMPair (Uniswap V2)  │  • zero the bonding curve
                   │   0% fee                │
                   └────────────────────────┘
                                │  post-graduation trading
                                ▼
                   ┌────────────────────────┐
                   │   AMMRouter (atomic)    │  transferFrom + swap in one tx
                   └────────────────────────┘  (fixes concurrent "AMM: K")
```

The bonding curve is the primary trading venue. The AMM only activates after graduation. The
`AMMRouter` is built but not yet deployed to testnet — it's only needed once concurrent
post-graduation swaps matter.

---

## Repository layout

```
.
├── apps/
│   ├── api/        NestJS API + indexer + WebSocket gateway (port 4000)
│   └── web/        Next.js 15 frontend (port 3000)
├── contracts/      Solidity: TokenFactory, BondingCurve, MemeToken,
│                   AMMFactory/Pair, AMMRouter, LiquidityMigration, Treasury, SafeUSDC
├── packages/
│   └── shared/     Arc chain config, contract addresses, constants (TS)
├── scripts/        E2E + load-test scripts (launch, buys, graduation, AMM swaps)
├── docs/           Project documentation (see docs/API.md)
├── 00_MASTER_PLAN.md         Overview, timeline, anti-rug mechanics
├── 01_PHASE0_research_foundation.md … 06_PHASE5_launch_growth.md  Phase specs
├── DECISION_LOG.md           All research findings & product decisions (read first)
├── AGENTS.md                 Operating guide for AI agents working on this repo
├── CODER_ONBOARDING.md       Engineer onboarding
├── TEAM_ONBOARDING.md        Team onboarding
└── STRESS_TEST_PLAYBOOK.md   Load + graduation + AMM test procedures
```

---

## Quickstart

### Prerequisites

- Node.js **≥ 20**
- PostgreSQL (or use the bundled `docker-compose.yml`)
- Redis
- An Arc testnet wallet funded with USDC (Circle faucet: <https://faucet.circle.com>)

### 1. Install

```bash
npm install          # installs all workspaces (apps/web, apps/api, packages/shared)
```

### 2. Configure

```bash
cp .env.example .env
```

Then fill in at minimum:

| Variable | Purpose |
|---|---|
| `ARC_RPC_URLS` | Comma-separated Arc RPC providers (4 public testnet URLs are pre-filled) |
| `POSTGRES_*` | DB connection (defaults match `docker-compose.yml`) |
| `REDIS_URL` | Redis connection for pub/sub + WebSocket relay |
| `AUTH_SECRET` | 32-byte hex secret for signing auth tokens — `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `ADMIN_WALLETS` | Comma-separated EVM addresses allowed to register agents / manage the deployer wallet |
| `DEPLOYER_PRIVATE_KEY` | Wallet that pays the 5 USDC creation fee + gas for agent launches (testnet only) |
| `PINATA_JWT` | Optional — enables token image uploads. If unset, the launch form falls back to URL input. |

Full variable reference in `.env.example`.

### 3. Start dependencies

```bash
docker compose up -d   # PostgreSQL + Redis
```

### 4. Run the database migration

```bash
npm run dev:api        # starts NestJS on :4000 (or use the db:migrate script)
```

### 5. Run the apps

```bash
npm run dev:api        # API + indexer + WebSocket  → http://localhost:4000
npm run dev:web        # Next.js frontend           → http://localhost:3000
```

### 6. Try the full flow end-to-end

```bash
node scripts/e2e-full-flow.js     # launch → buy → sell, ~30s end-to-end
```

---

## Smart contracts

All contracts are in `contracts/src/`. 33/33 Forge tests pass (26 core + 7 AMMRouter).

| Contract | Role |
|---|---|
| `TokenFactory` | Deploys a `MemeToken` + `BondingCurve` pair per launch. Charges a 5 USDC creation fee. |
| `BondingCurve` | USDC-denominated linear bonding curve. Buy/sell with 1% fee → Treasury. `ReentrancyGuard`-protected. Enforces max-wallet + cooldown pre-graduation. |
| `MemeToken` | Standard ERC-20 with max-wallet and cooldown hooks that are zeroed on graduation. |
| `LiquidityMigration` | `checkAndMigrate()` — atomic graduation: create AMM pair, add liquidity, burn LP, renounce ownership, mark graduated. |
| `AMMFactory` / `AMMPair` | Uniswap V2 fork (0% fee, no flash swaps). |
| `AMMRouter` | `swapExactUSDCForTokens` / `swapExactTokensForUSDC` — atomic `transferFrom + swap`, fixes the concurrent "AMM: K" revert. Built + tested, not yet deployed. |
| `Treasury` | Receives the 1% trade fee. |
| `SafeUSDC` | Low-level calls for Arc's non-standard `transferFrom` (returns void, not bool). |

Deployed contract addresses live in `packages/shared/src/index.ts` and `.env.example`.

### Anti-rug graduation guarantees

When a token graduates, all six of the following are verified on-chain in a single transaction:

1. AMM pair created with liquidity
2. LP tokens burned to `0x…dEaD` (100%)
3. Token ownership renounced (owner is the zero address)
4. Token marked `graduated == true`
5. Token's `bondingCurve` reference zeroed (max-wallet + cooldown disabled)
6. Curve marked `graduated == true`

Verified end-to-end on Arc testnet — see `AGENTS.md` → "Graduation + anti-rug test".

---

## Architecture

```
┌────────────┐     wagmi reads (same-origin)      ┌─────────────────────┐
│            │ ──────────────────────────────────▶ │   API  /rpc proxy   │
│  Next.js   │                                     │  (4-provider rotate)│
│  frontend  │ ◀────────────────────────────────── │                     │
│  (wagmi +  │     REST + Socket.IO                │   NestJS API        │
│  viem)     │ ──────────────────────────────────▶ │  • /tokens          │
│            │                                     │  • /agents          │
└────────────┘                                     │  • /referrals       │
       │ writes (user-signed txs)                  │  • /leaderboard     │
       ▼                                           │  • /auth, /favorites│
┌────────────┐                                     │  • /upload (IPFS)   │
│  Arc L1    │ ◀──── eth_getLogs (5s poll) ─────── │  • /indexer webhook │
│  (USDC     │                                     │  • WebSocket gateway│
│   native)  │                                     └─────────────────────┘
└────────────┘                                              │
       ▲                                                     │ Redis pub/sub
       │                                                     ▼
       └────────────── indexer writes ────── PostgreSQL ◀── Redis
                     (launch/buy/sell)         │
                                               └──▶ referral stats, leaderboard
```

- **Frontend** (`apps/web`): Next.js 15 + React 19 + wagmi 2 + viem 2 + Socket.IO client.
  All wagmi reads go through the same-origin `/rpc` proxy first, falling back to direct RPC URLs.
  Transactions are signed and broadcast by the user's wallet — the API never sees private keys.
- **API** (`apps/api`): NestJS 10. Helmet, CORS, global validation pipe (whitelist +
  forbidNonWhitelisted), `AllExceptionsFilter` for clean JSON errors. Per-route throttling via
  `@nestjs/throttler`.
- **Indexer**: `ArcEventPollerService` polls `eth_getLogs` every 5s across all 4 RPC providers
  (rotates on rate-limit). Writes to PostgreSQL, publishes to Redis `token:events`. The legacy
  Envio HyperIndex poller is kept as a disabled fallback.
- **WebSocket**: Socket.IO gateway subscribes to Redis pub/sub and relays `NEW_TOKEN`, `NEW_BUY`,
  `NEW_SELL`, `TOKEN_GRADUATED` to room `tokens:global` and per-token rooms `token:{address}`.
  Per-IP connection cap (5) to prevent flooding.

### Arc-specific gotchas (summary)

- USDC is the native gas token. 18-dec native, 6-dec ERC-20, **same asset**. Use 6-dec ERC-20
  views everywhere except gas math. Never mix the two.
- Arc USDC has **non-standard return values**: `transfer` returns bool, `transferFrom` returns
  void. Use the `SafeUSDC` library (low-level call).
- Block time ~0.5s, deterministic finality (N=1, no reorgs).
- LP tokens burn to `0x…dEaD` (not `address(0)`, due to Arc's zero-address rules).
- Arc testnet RPCs aggressively rate-limit (`-32011 request limit reached`). We rotate across
  all 4 public providers — see `ARC_RPC_URLS` in `.env.example`.

Full detail in `DECISION_LOG.md`.

---

## API

The full REST + WebSocket reference is in **[docs/API.md](docs/API.md)**.

Quick summary of surface area:

- `GET /tokens`, `GET /tokens/:address`, `GET /tokens/:address/trades`, `GET /tokens/:address/holders`, `GET /tokens/stats`
- `GET /tokens/:address/messages`, `POST /tokens/:address/messages`
- `GET /tokens/:address/metadata`, `POST /tokens/:address/metadata`
- `GET /auth/nonce`, `POST /auth/verify`
- `GET /favorites`, `POST /favorites/:tokenAddress`, `DELETE /favorites/:tokenAddress`, `GET /favorites/:tokenAddress`
- `GET /users/:wallet`
- `GET /leaderboard?type=…`
- `POST /rpc` (JSON-RPC read proxy)
- `GET /upload/status`, `POST /upload/image`
- `POST /indexer/event`, `POST /indexer/batch` (webhook, shared-secret auth)
- `POST /agents/register`, `POST /agents/launch`, `GET /agents`, `GET /agents/me`, `GET /agents/me/launches`, `GET /agents/me/trades`, `GET /agents/:agentId`, `GET /agents/:agentId/launches`, `GET /agents/:agentId/activity`, `GET /agents/:agentId/tips`, `POST /agents/:agentId/tip`
- `GET /agents/templates`, `GET /agents/templates/:id`, `POST /agents/templates`, `POST /agents/templates/:id/deploy`
- `GET /agents/leaderboard`
- `POST /agents/tokens/:address/messages`, `POST /agents/tokens/:address/metadata`, `POST /agents/tokens/:address/buy`, `POST /agents/tokens/:address/sell`
- `GET /agents/deployer/balance`, `POST /agents/deployer/approve`
- `POST /referrals/attribute`, `GET /referrals/:wallet`, `GET /referrals/:wallet/referred`, `GET /referrals/:wallet/referrer`, `GET /referrals/leaderboard/top`
- WebSocket: connect to `/`, join `tokens:global` or `token:{address}`, listen for `token:event`

---

## Testing & verification

```bash
# Smart contracts (Forge)
cd contracts && forge test            # 33/33 pass

# Type-check
npm run build                         # builds all workspaces

# End-to-end on Arc testnet
node scripts/e2e-full-flow.js         # launch → buy → sell, ~30s

# Load tests
node scripts/load-test-buys.js <curve> [concurrency] [usdc-per-buy]
node scripts/load-test-graduation.js  # full graduation + anti-rug checks (~$130)
node scripts/load-test-amm-swaps-simple.js [num-swaps] [usdc-per-swap]
node scripts/load-test-heavy-buy.js <curve> [usdc-amount]
```

Representative results on Arc testnet are recorded in `AGENTS.md` (Phase 4). Highlights:

- 25 concurrent buys, 2 USDC each: 25/25 success, no contract reverts, on-chain state consistent.
- Graduation: 6/6 anti-rug checks pass. LP burned 100%, ownership renounced.
- AMM sequential swaps: constant-product invariant holds (k drift 0.000002% from rounding).
- AMM concurrent swaps revert with "AMM: K" — correct Uniswap V2 behavior without a router;
  `AMMRouter` is the fix (built + tested, pending deployment).

---

## Status

| Phase | Status |
|---|---|
| 1 — Smart Contracts | Complete. 33/33 tests pass. Deployed to Arc testnet. |
| 2 — Backend + Indexer | Complete. API + direct RPC poller + WebSocket verified. |
| 3 — Frontend | Complete. Next.js 15 app builds, all pages serve, API integration live. |
| 4 — Testing & Security | Self-audit complete (2 rounds). Load test passed. External audit pending (required for mainnet). |
| 5 — Optional Features | Leaderboard UI, share cards, AMMRouter, referrals — all built and smoke-tested. |

**Not yet done:** external security audit (required for mainnet), `AMMRouter` deployment to
testnet, AMM swap contention test post-graduation.

---

## Further reading

- **[DECISION_LOG.md](DECISION_LOG.md)** — every research finding and product decision. Read this first.
- **[docs/API.md](docs/API.md)** — full REST + WebSocket API reference.
- **[AGENTS.md](AGENTS.md)** — operating guide for AI agents working in this repo (build status, gotchas, key files).
- **[00_MASTER_PLAN.md](00_MASTER_PLAN.md)** — overview, timeline, anti-rug mechanics.
- **[CODER_ONBOARDING.md](CODER_ONBOARDING.md)** / **[TEAM_ONBOARDING.md](TEAM_ONBOARDING.md)** — onboarding.
- **[STRESS_TEST_PLAYBOOK.md](STRESS_TEST_PLAYBOOK.md)** — load + graduation + AMM test procedures.

---

## License

This repository uses a **split license** — see [LICENSES.md](LICENSES.md) for the full
explanation.

| Component | License | File |
|---|---|---|
| **Smart contracts** (`contracts/`) | **MIT** — fully open source. The trust layer (anti-rug graduation, bonding curve) is free for anyone to use, audit, and build on. Every `.sol` file carries `SPDX-License-Identifier: MIT`. | [`contracts/LICENSE`](contracts/LICENSE) |
| **Application layer** (`apps/`, `packages/`, `scripts/`) | **Business Source License 1.1** (source-available). You may use, copy, modify, and run the code for **non-production** purposes (development, testing, evaluation). Production use requires written permission from the Licensor. On **2030-07-25** (the Change Date), the app layer automatically converts to the **MIT License**. | [`LICENSE`](LICENSE) |

The BSL is **not** an OSI-approved open source license — it's "source available." The contracts
are open source today; the app layer becomes open source in 4 years. This keeps the product
clone-resistant while the contracts remain fully open for trust and auditability.

See the deployed site's `legal/` pages for terms of service, privacy, and trademark guidelines.
