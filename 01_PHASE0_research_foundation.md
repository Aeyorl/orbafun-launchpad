# Phase 0 — Research & Foundation

**Gate to exit:** Arc contract/wallet landscape documented, repo boots, testnet
wallet funded, USDC dual-decimal model understood and logged, Arc `use-arc`
skill installed.

---

## 1. Research checklist (do this before writing contract code)

Most of the foundational Arc questions are already answered from doc research
(see section 5 below). The remaining items are:

- [ ] Confirm exact Arc block time target from docs or a live node — sub-second
  is confirmed, but the exact target (e.g. 0.5s, 0.8s, 1s) is needed to size
  `COOLDOWN_BLOCKS` in Phase 1. Don't assume; query `eth_blockNumber` over a
  time interval on testnet and measure.
- [ ] Review `/arc/references/sample-applications.md` for any DeFi/AMM examples
  to reference when building our own AMM in Phase 1.
- [ ] Check `testnet.arcscan.app` and the Arc ecosystem for competing memecoin
  launchpads — this changes launch timing pressure, not architecture.
- [ ] Confirm whether Arc's USDC blocklist is active on testnet (it may be
  mainnet-only). This affects whether the blocklist sell-revert edge case can
  be tested on testnet or needs simulation.
- [ ] Read `/arc/tutorials/porting-contracts-to-arc` — consolidated list of
  gotchas when porting standard EVM contracts to Arc. Relevant since we're
  forking Uniswap V2 core for the AMM.

Log findings in the decision log, not just in your head.

---

## 2. Repo structure

```
orbafun/
├── apps/
│   ├── web/              # Next.js 15 frontend
│   └── api/               # NestJS backend
├── contracts/
│   ├── src/
│   │   ├── TokenFactory.sol
│   │   ├── MemeToken.sol
│   │   ├── BondingCurve.sol
│   │   ├── LiquidityMigration.sol
│   │   ├── Treasury.sol
│   │   ├── AMMFactory.sol       # Uniswap V2 fork — graduation target
│   │   └── AMMPair.sol          # Uniswap V2 fork — graduation target
│   ├── test/
│   └── foundry.toml
├── indexer/                # Envio HyperIndex config (or Goldsky subgraph)
├── packages/
│   └── shared/              # types, ABIs, constants shared across apps
├── docs/
└── package.json             # workspaces
```

---

## 3. Tech stack (pinned)

| Layer | Choice |
|---|---|
| Frontend | Next.js 15, TypeScript, Tailwind, shadcn/ui, TanStack Query |
| Backend API | NestJS |
| DB | PostgreSQL |
| Cache/pubsub | Redis |
| Contracts | Solidity + Foundry |
| Chain interaction | viem + wagmi |
| Indexer | Envio HyperIndex (primary) or Goldsky Subgraphs+Mirror (fallback) |
| Hosting | Vercel (web), Railway (api/db), Cloudflare (CDN/DNS) |

**Indexer note:** Do NOT build a standalone block-listener worker from scratch.
Use Envio or Goldsky for event decoding, reorg handling, and resumability.
Build only the application layer on top (NestJS API, websocket relay, DB
schema, Redis cache). See Phase 2 for details.

---

## 4. Environment setup

```
# Arc testnet (confirmed from docs)
ARC_RPC_URL=https://rpc.testnet.arc.io
ARC_WS_URL=wss://rpc.testnet.arc.io
ARC_CHAIN_ID=5042002
ARC_USDC_ADDRESS=0x3600000000000000000000000000000000000000
ARC_NATIVE_USDC_EMITTER=0xfffffffffffffffffffffffffffffffffffffffe
ARC_AMM_FACTORY_ADDRESS=          # filled during Phase 1 (we deploy it)
DEPLOYER_PRIVATE_KEY=             # testnet only in .env, never commit
DATABASE_URL=
REDIS_URL=
KIT_KEY=                          # Circle App Kit key, if using App Kit features
```

## 5. Confirmed from Arc docs (already resolved — log to decision log)

These items were resolved during plan research and are listed here so they
don't get re-researched:

| Item | Value | Source |
|---|---|---|
| Execution environment | EVM (Reth, Osaka hardfork) | `/arc/concepts/execution-layer` |
| Contract language | Solidity (Foundry, Hardhat, viem, ethers.js all work) | `/arc/references/evm-differences` |
| Testnet RPC | `https://rpc.testnet.arc.io` (HTTP), `wss://rpc.testnet.arc.io` (WS) | `/arc/references/rpc-endpoints` |
| Chain ID | `5042002` | `/arc/references/rpc-endpoints` |
| Faucet | `faucet.circle.com` | `/arc/references/rpc-endpoints` |
| Block explorer | `testnet.arcscan.app` | `/arc/references/rpc-endpoints` |
| USDC ERC-20 address | `0x3600000000000000000000000000000000000000` (6 decimals) | `/arc/references/usdc-system-events` |
| USDC native emitter | `0xfffffffffffffffffffffffffffffffffffffffe` (18 decimals) | `/arc/references/usdc-system-events` |
| Finality | Deterministic, instant, N=1 confirmation sufficient | `/arc/concepts/deterministic-finality` |
| Gas model | USDC-native, ~$0.01/tx base fee, EWMA-smoothed, no EIP-1559 burn | `/arc/concepts/stable-fee-design` |
| Mainnet status | Testnet only; mainnet endpoints "published when available" | `/arc/references/rpc-endpoints` |
| Wallet support | Standard Ethereum wallets (MetaMask, Rabby, etc.) work as custom network | `/arc/references/evm-differences` |
| On-chain DEX | None exists — we deploy our own AMM (Phase 1) | Confirmed by absence in docs index |
| Indexer services | Envio, Goldsky, The Graph, Thirdweb all support Arc | `/arc/tools/data-indexers` |

## 6. Setup tasks

- [ ] Install Circle `use-arc` skill: `npx skills add circlefin/skills`
- [ ] Consider setting up Arc MCP server (`/ai/mcp.md` in Arc docs) for direct
  doc access from AI tools during development
- [ ] Fund testnet wallet via `faucet.circle.com`, verify balance via a basic
  script (note: `addr.balance` is 18-dec native USDC, `USDC.balanceOf(addr)` is
  6-dec ERC-20 — they're the same asset, verify they reconcile after conversion)

## 7. Definition of done

- [ ] All remaining research checklist items answered and logged
- [ ] Repo installs and boots (`npm install` succeeds at root)
- [ ] Testnet wallet funded via faucet, balance confirmed (both native and
  ERC-20 views checked, decimal conversion verified)
- [ ] `use-arc` skill installed
- [ ] USDC dual-decimal model understood and documented in decision log
- [ ] Exact block time measured and logged (for Phase 1 cooldown sizing)
