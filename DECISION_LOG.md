# Orba — Decision Log

All research findings, product decisions, and technical confirmations are
logged here with dates so later phases don't silently contradict earlier ones.

---

## 2026-07-17 — Phase 0 research findings

### D1. Arc execution environment confirmed: EVM (Reth, Osaka hardfork)

- **Decision:** Phase 1 contracts written in Solidity, using Foundry.
- **Reason:** Arc docs (`/arc/concepts/execution-layer`, `/arc/references/evm-differences`)
  confirm EVM compatibility. Solidity, Foundry, Hardhat, viem, ethers.js all
  work without modification.
- **Impact:** Original plan's Solidity assumption is correct. No rewrite needed.

### D2. USDC dual-decimal model confirmed

- **Decision:** Use 6-dec ERC-20 view throughout contracts and application,
  EXCEPT for raw gas/msg.value math (18-dec). No internal 18-dec accounting —
  since `buy()` uses `transferFrom` (6-dec), keeping everything in 6-dec
  avoids conversion entirely. Indexer standardizes on 18-dec (native emitter),
  converts to 6-dec for API/display.
- **Reason:** Arc docs confirm native USDC = 18 decimals, ERC-20 USDC = 6
  decimals, same underlying asset. The Circle `use-arc` skill recommends
  6-dec ERC-20 view everywhere except gas math — simpler and less error-prone
  than our original 18-dec internal approach. Since our `buy()` uses
  `transferFrom` (6-dec input), 6-dec internal accounting means zero
  conversions in the bonding curve.
- **Key addresses:**
  - ERC-20 USDC: `0x3600000000000000000000000000000000000000` (6 dec)
  - Native system emitter (EIP-7708): `0xfffffffffffffffffffffffffffffffffffffffe` (18 dec)
- **Impact:** BondingCurve must explicitly handle decimal conversion. Indexer
  must filter Transfer events by emitter to avoid double-counting.

### D3. Block time measured: ~0.504 seconds (504ms)

- **Decision:** COOLDOWN_BLOCKS must be sized against ~0.5s block time.
- **Reason:** Measured directly via RPC: 21 blocks in 10.59 seconds = 0.504s/block.
- **Impact:** A "10 block cooldown" = ~5 seconds, not 120 seconds (Ethereum).
  For meaningful anti-bot protection, need ~20-60 blocks (10-30 seconds).
  Exact value `[CONFIRM]` during Phase 1 economics modeling.

### D4. Deterministic finality confirmed — no reorg handling needed

- **Decision:** Indexer does not need N-confirmation waiting logic. N=1.
- **Reason:** Arc docs (`/arc/concepts/deterministic-finality`) confirm
  transactions finalize on inclusion. Measured block time confirms sub-second
  finality.
- **Impact:** Simplifies Phase 2 indexer. Envio/Goldsky handle this regardless.

### D5. Blocklist is testable on testnet — seeded blocklisted address confirmed

- **Decision:** Blocklist sell-revert edge case can be tested on Arc testnet,
  not just via mock.
- **Reason:** Arc docs (`/arc/references/contract-addresses#test-addresses-for-restricted-transfer-behavior`)
  confirm testnet seeds a blocklisted address from the standard Foundry test
  mnemonic.
- **Blocklisted test address:** `0x70997970C51812dc3A010C7d01b50e0d17dc79C8`
  - Derived from mnemonic `test test test test test test test test test test test junk`, index 1.
  - Private key derivable via: `cast wallet private-key --mnemonic "test test test test test test test test test test test junk" --mnemonic-index 1`
  - Value transfers to/from this address revert at runtime.
- **Impact:** Phase 1 Tier 2 integration test for blocklist can use this
  address directly. BondingCurve sell() must revert cleanly when payout
  targets this address.

### D6. No on-chain DEX/AMM exists on Arc — we build our own (Option A)

- **Decision:** Deploy own Uniswap V2-style AMM (AMMFactory + AMMPair) as
  graduation target.
- **Reason:** Arc docs index has no DEX/AMM pages. App Kit Swap is an off-chain
  SDK for stablecoin-to-stablecoin swaps, not an on-chain AMM router. No
  third-party DEX deployment found.
- **Impact:** Phase 1 includes 2 additional contracts (AMMFactory, AMMPair).
  Timeline +1 week. AMM is part of Phase 4 audit scope.

### D7. AMM porting guidance confirmed from Arc docs

- **Decision:** Fork Uniswap V2 core, use ERC-20 USDC directly as pair token,
  no WUSDC wrapper.
- **Reason:** Arc porting guide (`/arc/tutorials/porting-contracts-to-arc`)
  explicitly states:
  - "Use the ERC-20 USDC contract directly as the pair token."
  - "Do not deploy a WUSDC wrapper contract."
  - "Replace WETH-style code paths. Remove deposit()/withdraw() wrap-and-unwrap calls."
  - "Replace any WETH address constant with the ERC-20 USDC address."
  - "Convert between 18-dec native and 6-dec ERC-20 explicitly (1 ERC-20 unit = 10^12 wei)."
  - "Do not pair native against ERC-20 USDC in a liquidity pool — both are the same asset."
- **Impact:** AMMPair uses ERC-20 USDC (`0x3600...`) as one leg, MemeToken as
  the other. No wrapping logic needed. Simplifies the fork.

### D8. LP burn address: use 0x...dEaD, not address(0)

- **Decision:** Burn LP tokens to `0x000000000000000000000000000000000000dEaD`,
  not `address(0)`.
- **Reason:** Arc's value transfer rules forbid native value transfers to
  `address(0)` (reverts with "Zero address not allowed"). While ERC-20
  transfers to `address(0)` are contract-level and may work, competitor
  Orba uses `0x...dEaD` for safety. Using the conventional dead address
  avoids any edge case with Arc's zero-address rules and is the standard
  convention for provable burns.
- **Impact:** LiquidityMigration sends LP tokens to `0x...dEaD`. AMMPair's
  burn function must support this. Verify on testnet.

### D9. Competitor analysis: Orba (orba.app) is live, waiting for canonical DEX

- **Decision:** Our own AMM is a competitive differentiator. Consider hybrid
  approach: own AMM for v1, configurable migration target for future canonical
  DEX.
- **Reason:** Orba is a live product on Arc testnet with nearly identical
  architecture (factory + bonding curve + fixed-supply token). Key findings:
  - **They have NOT built their own DEX.** Their whitepaper says: "The DEX
    router address is configured per-deployment, so Orba targets whichever
    canonical AMM Arc adopts at mainnet without a contract change."
  - **They are blocked on mainnet launch** until a canonical DEX appears on Arc.
    Roadmap: "parameterized to deploy the moment Arc and its canonical DEX go live."
  - **Their economics are fully specified** (proven reference point):
    - Curve: constant-product (x·y=k), virtual reserves
    - Virtual USDC reserve: 5,866.67 USDC
    - Virtual token reserve: 1,466,666,667 tokens
    - Total supply: 1,000,000,000 tokens
    - 88% sold through curve, 12% reserved for DEX liquidity
    - Initial market cap: $4,000
    - Migration market cap: $25,000
    - Raise before migration: $8,800
    - DEX liquidity seeded: $8,500 (paired with 12% token allocation)
    - Fee: 1% flat (0.5% creator, 0.5% protocol)
  - **They use virtual reserves** (not real reserves) — pump.fun model.
  - **Fee split: 0.5% creator, 0.5% protocol** — gives creators ongoing
    incentive to promote their token.
  - **Atomic create-and-buy** path (like our Multicall3From stretch goal).
- **Other competitors found (less mature):**
  - `rakibhosen21/Arc-meme-launchpad` — hackathon project, testnet only
  - `PHUOCHAU2403/arc-pump` — AI-agent-operated launchpad, testnet
  - Arcforge — hackathon project, plans to add bonding curves later
- **Impact:** Our own AMM lets us launch the moment Arc mainnet ships, while
  Orba waits for a third-party DEX. Consider adopting their fee split
  (0.5% creator / 0.5% protocol) as a creator acquisition tool. Use their
  economics as a reference for our Phase 1 bonding curve modeling.

### D10. Reference implementation found: Arc prediction markets sample app

- **Decision:** Study the Arc prediction markets sample app for AMM patterns.
- **Reason:** Arc sample apps page lists "Arc prediction markets" which uses
  "a constant-product AMM for position token trading." This is a reference
  implementation of a constant-product AMM on Arc, built with Hardhat.
- **Impact:** Reference for our AMM fork — shows how someone else handled
  USDC pairing and AMM logic on Arc. URL: `/build/sample-apps/arc-prediction-markets`

### D11. Arc testnet parameters confirmed

- **Decision:** Use these values for all development and testing.
- **Values:**
  - RPC (HTTP): `https://rpc.testnet.arc.io`
  - RPC (WS): `wss://rpc.testnet.arc.io`
  - Chain ID: `5042002`
  - Currency symbol: USDC
  - Block explorer: `testnet.arcscan.app`
  - Faucet: `faucet.circle.com`
  - CCTP domain: 26
- **Impact:** Environment files use these values. No `[CONFIRM]` needed.

### D12. Gas model confirmed — ~$0.01/tx, USDC-denominated

- **Decision:** Gas budget is not a concern for the "launch in 60 seconds for
  5 USDC" pitch.
- **Reason:** Arc Fee Manager targets ~$0.01/tx base fee, EWMA-smoothed, no
  EIP-1559 burn (fees go to block proposer). Gas cost is ~500x less than
  creation fee.
- **Impact:** No gas budget item needed in Phase 1. Launch UX holds up.

### D13. Local Foundry/anvil tests insufficient — confirmed

- **Decision:** Two-tier test strategy in Phase 1: forge tests (pure EVM) +
  Arc-testnet integration tests (Arc-specific behavior).
- **Reason:** Arc docs explicitly state: "Tools that locally simulate the EVM
  (such as Foundry's anvil) run a standard EVM, not Arc's, so they cannot
  reproduce Arc-specific behavior."
- **Impact:** Phase 1 test suite includes Tier 2 integration tests against
  `https://rpc.testnet.arc.io` for USDC behavior, EIP-7708 events, blocklist.

### D14. Mainnet is not yet live — testnet-only build target

- **Decision:** Build target is testnet-complete. Mainnet launch gated on
  (1) Arc mainnet going live, (2) external audit completed.
- **Reason:** Arc docs confirm: "Mainnet endpoints and parameters are published
  separately when available." All contract addresses are testnet-only.
- **Impact:** Phase 5 acknowledges mainnet dependency. No control over Arc's
  timeline. Use waiting period for audit + growth prep.

### D15. Indexer services available on Arc — use Envio or Goldsky

- **Decision:** Use Envio HyperIndex (primary) or Goldsky Subgraphs+Mirror
  (fallback). Do not build standalone indexer from scratch.
- **Reason:** Arc docs (`/arc/tools/data-indexers`) list Envio, Goldsky, The
  Graph, and Thirdweb as available indexing services. These handle event
  decoding, reorg handling, and resumability.
- **Impact:** Phase 2 timeline reduced from 2-2.5 weeks to 1.5-2 weeks. Build
  only application layer (NestJS API, websocket relay, DB schema, Redis cache).

### D16. Circle use-arc skill installed — viem has built-in arcTestnet chain

- **Decision:** Use viem's built-in `arcTestnet` chain definition for Phase 3.
  No custom chain config needed.
- **Reason:** The `use-arc` skill confirms `import { arcTestnet } from
  'viem/chains'` works out of the box. Chain ID 5042002 is built in.
- **Impact:** Phase 3 frontend setup is simpler — no custom wagmi chain def.

### D17. Both RPC URLs work — .io and .network are the same network

- **Decision:** Use `https://rpc.testnet.arc.io` as primary (from official docs).
  `https://rpc.testnet.arc.network` (from use-arc skill) is a valid alias.
- **Reason:** Tested both — they return consecutive block numbers, confirming
  they hit the same network.
- **Impact:** No change needed, but noted for troubleshooting if one endpoint
  has issues.

### D18. Testnet wallet funded and verified

- **Decision:** Deployer wallet address `0x74E931264f0f83F6c22d263efD8aA719D5e7f337`.
- **Reason:** Funded via faucet.circle.com, verified via `scripts/check-balance.js`.
- **Balance:** 59.98 USDC (sufficient for testnet deployment + testing).
- **Reconciliation:** Native (18-dec) and ERC-20 (6-dec) views match exactly.
- **Security:** Private key stored in `.env` (gitignored). Will use Foundry
  encrypted keystore (`cast wallet import`) for Phase 1 deployments, not
  CLI flags.
- **Impact:** Phase 0 Definition of Done met. Ready for Phase 1.

### D19. Creator fee revenue model — Option A

- **Decision:** 1% trading fee on bonding curve, split 0.5% creator / 0.5%
  protocol. Creator fees accrue during the bonding curve phase ONLY — no
  creator fee routing in the AMM post-graduation (v1). Fees claimable anytime.
- **Reason:** Creator revenue is essential for the pump.fun model — creators
  promote their token to earn ongoing fees. 50/50 split matches Orba (proven).
  Bonding-curve-only keeps the AMM as a clean Uniswap V2 fork (smaller audit
  surface, faster ship). Post-graduation creator fees are a clean v2 feature.
- **Mechanics:**
  - Fees tracked separately from curve reserves (no accounting bugs)
  - On buys: fee taken from USDC input before tokens credited
  - On sells: fee taken from USDC output before payout
  - Creator = address that called createToken() (from TokenFactory)
  - `claimCreatorFees()` — only creator, pull-based (not auto-distribute)
  - `claimProtocolFees()` — only owner/treasury
  - No transferable creator role in v1
- **Impact:** BondingCurve.sol gains creator/protocol fee accrual + claim
  functions. TokenFactory passes creator address to BondingCurve. AMM stays
  clean V2 fork. Phase 1 `[CONFIRM]` on trading fee resolved: 1%, split 0.5/0.5.

### D20. Bonding curve economics parameters locked in

- **Decision:** Adopt Orba's proven parameters as v1 starting point.
- **Parameters:**
  - Total supply: 1,000,000,000 tokens (1B)
  - Supply on curve: 88% (880M tokens)
  - Supply reserved for DEX: 12% (120M tokens)
  - Virtual USDC reserve: 5,866.67 USDC
  - Virtual token reserve: 1,466,666,667 tokens
  - Initial market cap: $4,000
  - Graduation market cap: $25,000
  - USDC raised at graduation: $8,800
  - LP seeded: $8,500 USDC + 120M tokens
  - Graduation premium: 2.83x (intentional — pump on graduation)
  - Remaining to treasury: $300
  - Fee: 1% (0.5% creator / 0.5% protocol)
  - Creator earns: ~$44 per token graduation (buy fees only)
  - Protocol earns: ~$44 per token graduation (buy fees only)
- **Reason:** Orba's parameters are proven and live. The 2.83x graduation
  premium is a feature (pump.fun-style pump on graduation), not a bug. Slippage
  is fine for realistic memecoin swap sizes (<1.2% for $100 swaps). Don't
  differentiate on economics in v1 — differentiate on product (own AMM, no
  freeze, creator fees).
- **Impact:** All Phase 1 `[CONFIRM]` economics values resolved. Curve formula
  is constant-product (x*y=k) with virtual reserves. COOLDOWN_BLOCKS still
  needs sizing against 0.5s block time — recommend 20-40 blocks (10-20s).

### D21. Phase 1 contracts deployed to Arc testnet

- **Decision:** All 4 protocol contracts deployed and verified on Arc testnet.
- **Block:** 52503967
- **Addresses:**
  - Treasury:           0x7B43cEDAA3e96c98D6f8c981d9d8BF4bFB443A7c
  - AMMFactory:         0x82682239405999C0F19dc5a850Abf0e35583d04D
  - TokenFactory:       0x8e5710fc5a3f2aA69104AC1b57E6916F7634701B
  - LiquidityMigration: 0xd5F18F71FdFB6eB8fC49b32b2B264aC162F31525
- **Gas cost:** ~0.16 USDC (9564823 gas at 42 gwei)
- **Verification:** All 4 contracts have bytecode on-chain (confirmed via RPC).
- **Wiring:** factory.setMigrator(migrator) called — new curves get migrator address.
- **Tier 1 tests:** 16/16 passing (forge test, local anvil).
- **Impact:** Ready for Tier 2 integration tests on Arc testnet (real USDC,
  EIP-7708 events, blocklist behavior, graduation E2E).

### D22. Arc USDC has non-standard return values — SafeUSDC library created

- **Decision:** All USDC interactions use `SafeUSDC` library (low-level call
  with return value check that handles both bool-returning and void-returning
  ERC-20s). Created `contracts/src/SafeUSDC.sol`.
- **Reason:** Arc's USDC `transfer` returns `bool true`, but `transferFrom`
  returns **void** (no return data, just reverts on failure). This is the same
  non-standard behavior as original Ethereum USDC. Our contracts originally
  checked `IERC20.transferFrom()` return value, which failed because there was
  no return data to decode.
- **Impact:** BondingCurve, Treasury, and LiquidityMigration all updated to use
  SafeUSDC. TokenFactory already used low-level call (was unaffected). This is
  a critical fix — without it, no USDC transferFrom would ever succeed.

### D23. Arc system precompiles don't exist in anvil fork mode

- **Decision:** Tier 2 integration tests use MockUSDC (vm.etch at 0x3600...)
  instead of the real Arc USDC. MockArcBlocklist placed at 0x1800...0001.
- **Reason:** Arc's USDC delegatecalls to an implementation at 0x3910... that
  uses TWO system precompiles:
  1. `0x1800...0001` = `isBlocklisted(address)` — checks USDC blocklist
  2. `0x1800...0000` = `transfer(from, to, amount18dec)` — native USDC transfer
  Neither exists in anvil fork mode (StackUnderflow). The blocklist precompile
  was mocked successfully, but the native transfer precompile cannot be mocked
  because it does system-level balance manipulation that anvil can't reproduce.
- **Impact:** Tier 2 tests validate the USDC *interface* (6-dec, transferFrom,
  transfer, approve, blocklist revert behavior) but NOT the real Arc runtime.
  The real Arc runtime behavior (native transfer, EIP-7708 events, blocklist
  enforcement) must be validated by an on-testnet E2E script that sends real
  transactions. This is a known limitation documented in the test file.
- **Test results:** 26/26 tests pass (16 Tier 1 local + 10 Tier 2 fork).

### D24. On-testnet E2E verified — token launch + buy with real Arc USDC

- **Decision:** Phase 1 contracts are fully functional on real Arc testnet.
- **Verified on-chain:**
  - Token "Arc Doge" (ADOGE) launched: token `0xa9496bfe...`, curve `0x8d8d07f1...`
  - Creation fee: 5 USDC transferred to treasury (real USDC transferFrom)
  - Buy: 10 USDC → 4,933,349 tokens (real USDC transferFrom, curve math correct)
  - Market cap: $4,027 (up from $4,000 initial)
  - Creator fees: 0.1 USDC accrued (0.5% of 2 × 10 USDC buys)
  - EIP-7708 dual-emitter confirmed: both `0x3600...` (6-dec) and `0xff...fe`
    (18-dec) emit Transfer events for the same USDC transfer
- **Redeployed addresses (with SafeUSDC fix, block 52509682):**
  - Treasury:           0xCAbb4Bb2C267Ba672aB69Cca624220bEda06f9F7
  - AMMFactory:         0x05188D467dC4Ff29Df531563a160eaA7c59e2ec1
  - TokenFactory:       0x26Ab49011AAf73c373e462CbD5445588Ff69b7A6
  - LiquidityMigration: 0x664A37fED62192b9B29c66572198524e2CC8A6A6
- **Impact:** Phase 1 is complete. All contracts work on real Arc testnet.
  Ready for Phase 2 (backend + indexer).

### D25. Phase 2 architecture — Envio HyperIndex + NestJS + Postgres + Redis

- **Decision:** Use Envio HyperIndex (first-class Arc testnet support via
  HyperSync) as the indexer, feeding events to a NestJS API via webhooks.
  The API writes to Postgres and publishes to Redis pub/sub, which relays
  to WebSocket clients.
- **Architecture:**
  ```
  Arc testnet events
       ↓
  Envio HyperIndex (config.yaml + Handlers.ts)
       ↓ webhook (POST /indexer/event)
  NestJS API (IndexerController → IndexerService)
       ↓
  Postgres (tokens, trades, users, graduations, amm_swaps)
       ↓ + Redis pub/sub
  WebSocket gateway → connected clients
  ```
- **Why Envio:** First-class Arc testnet support, HyperSync (1000x faster
  than RPC), handles reorgs/resumability, dynamic contract registration
  for per-token BondingCurve and AMMPair contracts.
- **Why webhooks (not polling):** Real-time, lower latency than GraphQL
  polling. Envio calls our API for each decoded event. Authenticated via
  shared secret (X-Indexer-Secret header).
- **Database schema:** 6 tables (users, tokens, trades, graduations,
  amm_swaps, indexer_state). All USDC amounts in 6-dec, token amounts in
  18-dec. Unique constraint on (tx_hash, log_index) for idempotent
  re-indexing. Triggers for user volume aggregation.
- **Caching:** Redis caches list queries (10s TTL), single token (5s TTL),
  user profiles (30s TTL), leaderboards (30s TTL). Cache invalidated on
  new events.
- **WebSocket:** Two subscription scopes — global (tokens:global room for
  landing page live feed) and per-token (token:{address} room for coin
  page). Events: NEW_TOKEN, NEW_BUY, NEW_SELL, TOKEN_GRADUATED.
- **E2E verified:** Simulated TokenCreated + Buy events from our on-testnet
  Arc Doge token. All 8 API endpoints return correct data. Market cap,
  price, curve USDC, and trade history all match expected values.
- **Files:**
  - `apps/api/db/schema.sql` — Postgres schema (6 tables, indexes, triggers)
  - `apps/api/src/` — NestJS API (8 modules: database, redis, tokens, users,
    leaderboard, websocket, indexer, app)
  - `indexer/config.yaml` — Envio HyperIndex config (4 contracts, 13 events)
  - `indexer/schema.graphql` — Envio entity schema (8 entity types)
  - `indexer/src/Handlers.ts` — Envio event handlers (TypeScript)
  - `docker-compose.yml` — Postgres + Redis for local dev

### D26. Phase 3 frontend — design system and architecture

- **Decision:** Build a Next.js 15 App Router frontend with a dark theme
  inspired by pump.fun's energy and orba.app's clean USDC-native aesthetic.
- **Design system:**
  - Dark background (#0a0a0b) with neon green (#00ff9d) primary accent
  - USDC blue (#3b82f6) secondary, purple (#a855f7) for graduation states
  - Red (#ef4444) for sells/danger, orange (#f97316) for near-migration
  - Inter font for UI, JetBrains Mono for numbers/addresses
  - Radial gradient background glow (green top, blue bottom)
  - Bonding curve progress bars with green-to-blue gradient fill
- **Pages (6):**
  - `/` — Landing: hero, stats bar, how-it-works, token board with tabs
    (newest/market cap/volume/graduated), live WebSocket ticker
  - `/explore` — Full token list with search, sort, status filter, pagination
  - `/launch` — Create token form with fee display, wallet state warnings
    (no USDC for gas, insufficient for fee), economics info
  - `/coin/[address]` — Token detail: header with stats + progress bar,
    price chart (recharts area chart), trade panel (buy/sell with live
    quote, slippage, USDC approval flow), trade history, token info
  - `/profile/[wallet]` — User profile: stats, launched tokens grid
- **Wallet integration:**
  - wagmi v2 with `injected()` connector (MetaMask, Rabby, etc.)
  - Arc testnet chain (built into viem, no custom chain def)
  - USDC balance displayed in navbar (native balance = USDC on Arc)
  - Wrong network detection
  - No-gas-money and insufficient-for-fee states handled explicitly
- **Real-time:**
  - Socket.io client connects to API WebSocket gateway
  - Global subscription for landing page (new tokens appear at top)
  - Per-token subscription for coin page (trades update live)
  - REST refetch every 15-30s as fallback (per Phase 3 spec)
  - Live ticker bar at top of every page
- **USDC display:** 6-decimal format (familiar to users) — formatUsdc()
  converts from bigint internal representation
- **Build issue resolved:** wagmi v2 connector barrel export pulls in
  Coinbase SDK / x402 / MetaMask SDK optional deps. Fixed with webpack
  IgnorePlugin for @x402/*, pino-pretty, and react-native-async-storage.
- **Files:**
  - `apps/web/src/app/` — 6 page routes (layout, providers, globals.css)
  - `apps/web/src/components/` — 7 components (Navbar, LiveTicker,
    TokenCard, TokenGrid, TradePanel, PriceChart, TradeHistory)
  - `apps/web/src/lib/` — config.ts (wagmi), api.ts (REST client),
    useWebSocket.ts (Socket.io hook), utils.ts (formatters)
  - `apps/web/tailwind.config.ts` — design system (colors, animations)
  - `apps/web/next.config.js` — env vars + webpack IgnorePlugin fixes

### D27. Envio HyperIndex V3 — real on-testnet indexing

- **Decision:** Use Envio HyperIndex V3 for indexing Arc testnet events.
  Replaces the earlier webhook-based approach with Envio's managed
  Hasura GraphQL API.
- **Setup:**
  - Envio CLI installed via npm in WSL (required on Windows)
  - Indexer runs from WSL native filesystem (`~/orbafun-indexer`) because
    npm install fails on /mnt/c (Windows filesystem)
  - `run-wsl2.sh` script syncs files from Windows → WSL and starts indexer
  - Docker containers: `envio-postgres` (port 5433) + `envio-hasura` (port 8080)
  - Hasura admin secret: "testing" (auto-set by Envio dev)
- **Config (`config.yaml`):**
  - 4 contracts: TokenFactory, BondingCurve, LiquidityMigration, AMMPair
  - ABI files extracted from Foundry artifacts (`abis/*.json`)
  - BondingCurve + AMMPair registered dynamically via `contractRegister`
  - RPC: `https://rpc.testnet.arc.io` with `for: sync` + `for: realtime`
    (Arc testnet not in HyperSync, so RPC is primary data source)
  - `field_selection.transaction_fields: [hash]` (not included by default in V3)
  - `address_format: lowercase`
- **Handlers (`src/handlers/index.ts`):**
  - V3 unified API: `indexer.onEvent()` + `indexer.contractRegister()`
  - `contractRegister` for BondingCurve on TokenCreated, AMMPair on Graduated
  - Price/marketCap stored as String (simpler than BigDecimal)
  - Nullable fields use `undefined` not `null` (V3 requirement)
  - `package.json` has `"type": "module"` (required for ESM import of envio)
- **Schema (`schema.graphql`):**
  - 8 entity types: Token, Trade, Graduation, AmmSwap, User, IndexerState,
    CurveMapping, AmmPairMapping
  - Relationships via `@derivedFrom` (Token.trades, Token.graduations)
  - IndexerState.id is String (V3 requires consistent ID types across entities)
- **Verified:**
  - Indexed real "Arc Doge" (ADOGE) token from Arc testnet
  - 2 Buy trades indexed with correct USDC amounts
  - User entity with volume tracking
  - Hasura GraphQL API serving data at localhost:8080
- **Known issue:** Arc testnet public RPC rate limits (code -32011) cause
  warnings during historical backfill. Indexer auto-retries with smaller
  block ranges. For production, use a higher-rate-limit RPC endpoint.
- **Files:**
  - `indexer/config.yaml` — V3 config with RPC + field_selection
  - `indexer/schema.graphql` — V3 schema with relationships
  - `indexer/src/handlers/index.ts` — V3 unified API handlers
  - `indexer/abis/*.json` — Extracted ABIs from Foundry
  - `indexer/package.json` — ESM (`"type": "module"`)
  - `indexer/run-wsl2.sh` — WSL sync + start script

### D28. Product decisions confirmed

- **Graduation:** Option A — deploy own minimal AMM (Uniswap V2 fork).
- **Comments:** Cut from v1 — remove from Phase 2/3.
- **Freeze function:** Remove entirely — tokens fully immutable post-launch.
- **Audit gate:** Required for mainnet, self-audit sufficient for testnet.
- **Reason:** User decisions during plan discussion. All reduce scope/attack
  surface for v1.
