# Orba DeFi Security Audit

**Assessment date:** 2026-09-01
**Target:** `https://orba.fun` and the Arc testnet protocol/API deployment
**Base audited revision:** `1653fdfd10ddece0300732c14cf466f3cfeb057e` (`origin/master`)
**Remediation state:** clean-worktree release commit based on the revision above; bind deployment and external review to the commit containing this report and its regenerated manifest
**Network:** Arc testnet, chain ID `5042002`
**Assessment type:** Internal pre-audit hardening review; not an independent third-party audit

## 1. Executive summary

Orba's current hardened release is substantially safer than the earlier deployment. The review did not identify a Critical or High severity direct-loss vulnerability in the audited smart contracts. The deployed governance path is a 2-of-3 Safe controlling a 48-hour timelock; the timelock owns the configurable protocol contracts and Treasury. Token supply is fixed, curve trading has receipt-authoritative events and slippage checks, graduation creates a fresh canonical AMM pair, and migration burns the LP position.

The remediation worktree fixes three Medium findings, all five Low findings, and two Informational findings in source. The remaining Medium finding (M-02) and Informational release blocker (I-03) require external deployment evidence: a new immutable contract deployment, explorer source verification, and a funded production-threshold graduation rehearsal. Those controls are now mandatory in the mainnet readiness gate and cannot be represented as complete by a passing unit test.

The deployed contracts also lack published source verification on Arcscan. Local runtime-bytecode matching is useful internal evidence, but users cannot independently reproduce that result from the explorer. Image uploads and the public RPC proxy remain economically abusable through distributed identities/IPs, and several lower-severity governance, CI, agent-slippage, and direct-AMM usability risks remain.

### Verdict

**Source remediation is complete for every code-addressable finding. Do not use the old deployment as evidence that the contract fixes are live. Mainnet and meaningful funds remain blocked until the remediated contracts are deployed, all sources are verified on the explorer, the production-threshold graduation evidence gate passes, and an independent credentialed audit approves the exact release revision and addresses.**

## 2. Scope and limitations

### In scope

- All production Solidity contracts in `contracts/src/`:
  - `TokenFactory.sol`
  - `MemeToken.sol`
  - `BondingCurve.sol`
  - `LiquidityMigration.sol`
  - `AMMFactory.sol`
  - `AMMPair.sol`
  - `AMMRouter.sol`
  - `Treasury.sol`
  - `ProtocolTimelock.sol`
  - `SafeUSDC.sol`
- Contract tests, Foundry configuration, deployment evidence, and shared addresses.
- NestJS API authentication, agents/custody, indexer, RPC proxy, uploads, referrals, monitoring, and database constraints.
- Frontend launch and trading transaction construction, build-time configuration, CSP/security headers, and test suite.
- GitHub release, monitoring, and backup workflows.
- Read-only live checks of `orba.fun`, the Render API, Arc RPC state, Safe configuration, protocol ownership, and Arcscan verification state.

### Out of scope / limitations

- No exploit transactions were submitted to public infrastructure or Arc testnet.
- No production secrets, cloud consoles, AWS KMS policies, Render/Vercel account permissions, Supabase control plane, or Pinata account settings were accessed.
- No formal verification, symbolic execution, or Slither/Mythril/Semgrep run was available in the environment. Manual review, Foundry tests, Forge lint, npm audit, application tests, builds, and read-only chain calls were used instead.
- The new hardened TokenFactory has not completed a production-threshold graduation on the deployed Arc testnet contracts. The local automatic-graduation canary passes, but the fork test explicitly states that full deployed-threshold graduation requires more than approximately 8,800 USDC.
- Arc testnet behavior and economics are not a substitute for mainnet validation. Arc mainnet RPC, deployments, addresses, operational permissions, and liquidity conditions were not in scope.
- This review is point-in-time and bound to the exact revision and addresses listed below.

### Deployed addresses checked

| Component | Address |
|---|---|
| ProtocolTimelock | `0x23a038742a12d9D8ABcfF62c5bFA36b608fFe17e` |
| Treasury | `0x41712d8cebdAfc5b7eac343F2add73288248bd5c` |
| AMMFactory | `0x9f2E34c3A32819268E6e37c0Cb76F53724F222b1` |
| AMMRouter | `0x194f27364bAdE80DF0C5b4f31CcE667FF6ea8F39` |
| TokenFactory | `0x3dD9bA8Aa1d92ebfdBE10438618d643757bE64B3` |
| LiquidityMigration | `0x93E16Bd952E3d60a99E27BB7ED06A612Def7a77d` |
| Admin / pause Safe | `0x33E4bd4561EE669012ff83b4eE5609122838bDcB` |

## 3. Finding summary

| ID | Severity | Title | Status |
|---|---|---|---|
| M-01 | Medium | AMM input inference accepts a transfer emitted by an unrelated token | Fixed in source and regression-tested |
| M-02 | Medium | Deployed protocol source is not published on Arcscan | Deployment evidence pending; hard-gated |
| M-03 | Medium | Authenticated image uploads remain Sybil- and quota-abusable | Fixed in source |
| M-04 | Medium | Public RPC proxy permits high-amplification read workloads | Fixed in source |
| L-01 | Low | Agent trade slippage is not bounded server-side | Fixed in source and boundary-tested |
| L-02 | Low | Timelock operations remain executable forever after becoming ready | Fixed in source; redeploy required |
| L-03 | Low | Direct AMM transfer-then-swap flow can be claimed or griefed | Fixed in source; redeploy required |
| L-04 | Low | Release assurance uses a mutable action and stale contract addresses | Fixed |
| L-05 | Low | WebP validation checks only the generic RIFF prefix | Fixed and regression-tested |
| I-01 | Informational | AMM charges no swap fee and permanently burns its LP position | 0.3% LP fee implemented; redeploy required |
| I-02 | Informational | AMMFactory retains an unused deployer `feeSetter` value | Removed; redeploy required |
| I-03 | Informational | Production-threshold deployed graduation remains untested | Deployment evidence pending; hard-gated |

### Remediation implementation notes

- M-01: the poller now binds fallback receipt inference to the canonical input asset, rejects ambiguous traders, and has a forged-token regression test. The new pair also emits measured input amounts directly.
- M-03/L-05: authenticated uploads are decoded with bounded pixels/dimensions, metadata-stripped, canonicalized to WebP, content-deduplicated, and charged atomically against wallet and global Redis budgets. Quota-service failure is fail-closed.
- M-04: RPC batches are capped at ten, execution calls at four per batch, calldata at 16 KiB, declared gas at five million, and methods consume a shared weighted per-IP Redis budget. The API trusts exactly one production proxy hop.
- L-01: funded-agent slippage is restricted to 0-1,000 bps at both controller and signer-service boundaries.
- L-02: timelock operations expire after a 14-day grace period and can then be cleaned up permissionlessly.
- L-03/I-01/I-02: swaps are restricted to factory-authorized atomic routers, the pool charges a 0.3% LP fee, input amounts are emitted, and unused `feeSetter` state was removed. Legacy direct-pair load scripts fail closed unless explicitly enabled as unsafe reproducers.
- L-04: the Foundry action is pinned to commit `908c540300062bd5a7e473851cdb4282204cee09`, and CI addresses now match the active testnet configuration.
- M-02/I-03: mainnet readiness now verifies explorer source state for every deployed component and requires full production-threshold graduation, AMM buy, and AMM sell transaction evidence. These findings remain externally pending until a remediated deployment supplies that evidence.

## 4. Detailed findings

### M-01 — AMM input inference accepts a transfer emitted by an unrelated token

**Severity:** Medium
**Location:** `apps/api/src/indexer/arc-event-poller.service.ts:566-612`; downstream accounting in `apps/api/src/indexer/indexer.service.ts:656-846`
**Category:** CWE-345 Insufficient Verification of Data Authenticity; oracle/indexer integrity; availability

**Description:** `AMMPair.swap()` emits zero for both input fields and expects the input to be inferred off-chain. The poller fetches the transaction receipt, selects the last `Transfer` log before the `Swap` whose recipient is the pair, and treats its data as the swap input. It does not require `candidate.address` to equal the expected pair input token. Event topics and values emitted by an arbitrary attacker-controlled ERC-20 are therefore accepted as authoritative AMM accounting.

**Attack scenario:**

1. The attacker transfers a valid, small amount of the actual pair input token to the pair.
2. In the same transaction, an attacker-controlled token emits `Transfer(attacker, pair, forgedAmount)` immediately before calling `pair.swap()`.
3. The AMM uses its actual token balances, so the on-chain swap can succeed normally.
4. The indexer chooses the malicious token's later transfer and records `forgedAmount` as USDC or meme-token input.
5. A value within database bounds corrupts AMM volume, wallet cost basis, portfolio data, leaderboard data, and referral calculations. A sufficiently large value can fail a `NUMERIC(40,0)`/related write, make `handleAmmSwap` rethrow, and prevent the poller checkpoint from advancing past the block.

**Impact:** Off-chain economic/accounting corruption and potential sustained indexer denial of service. No direct pool-reserve theft was identified from this path. The impact becomes High if referral balances are paid automatically or other monetary decisions trust these indexed values.

**Likelihood:** Moderate. The attack requires a crafted transaction/contract but no privileged role and can be performed permissionlessly after a token graduates.

**Recommendation:**

- Resolve `token0` and `token1` from the canonical pair and determine the expected input asset from the non-zero output.
- Require the selected `Transfer` log's emitter address to equal that expected input token.
- Prefer making `AMMPair` emit its measured `amount0In`/`amount1In` directly. This removes receipt-order inference entirely.
- Cross-check inferred input against pair balance/reserve deltas or router calldata when the canonical router is the sender.
- Reject, alert, and quarantine malformed swaps without permanently holding the global checkpoint.
- Add an adversarial test containing a forged unrelated-token transfer immediately before the swap.

**References:** CWE-345; SWC-132 (unexpected data/source assumptions); OWASP Smart Contract Top 10 SC06/SC08 principles.

### M-02 — Deployed protocol source is not published on Arcscan

**Severity:** Medium
**Location:** All six deployed protocol addresses; Arcscan `/api/v2/smart-contracts/<address>` responses expose bytecode but no verified source/name/compiler metadata
**Category:** Deployment transparency; supply-chain and rug-pull assurance

**Description:** The deployed contract runtimes were previously matched internally against local build artifacts, and no Solidity changes occurred between that deployment snapshot and the audited revision. However, Arcscan does not show the protocol contracts as source-verified. Users, integrators, and external auditors cannot independently inspect or reproduce the deployed implementation from the canonical explorer.

**Attack scenario:** A future deployment, address substitution, compromised frontend configuration, or build-toolchain drift could present bytecode different from the public repository while ordinary users continue trusting repository source. Without explorer verification, independent detection is materially harder.

**Impact:** Reduced verifiability, weaker anti-rug assurance, harder incident response, and a larger trust requirement on the Orba team and its internal evidence.

**Likelihood:** High as an assurance gap; it exists now. This finding does not by itself prove malicious bytecode.

**Recommendation:** Verify and publish exact source for every deployed contract with Solidity `0.8.26`, optimizer settings, EVM version, constructor arguments, and linked libraries. Publish reproducible build commands and an address-to-runtime-hash manifest. Add a release gate that compares live bytecode hashes with artifacts and fails on drift.

**References:** OWASP SCSVS code/deployment verification principles; SLSA provenance principles.

### M-03 — Authenticated image uploads remain Sybil- and quota-abusable

**Severity:** Medium
**Location:** `apps/api/src/upload/upload.controller.ts:86-178`; `apps/api/src/auth/`
**Category:** CWE-400 Uncontrolled Resource Consumption; abuse prevention

**Description:** `/upload/image` now requires SIWE authentication, limits each file to 5 MB, and throttles to ten uploads per minute per IP. Those are meaningful controls. A wallet identity is free to create, however, and the endpoint has no per-wallet daily quota, no account-age/stake/paid-launch requirement, no aggregate Pinata budget circuit breaker, and no deduplication/content-address preflight. Distributed wallets and IPs can still consume the platform's storage and API quota.

**Attack scenario:** An attacker creates many wallets, authenticates each, rotates IPs/proxies, and submits valid image files continuously. Each request passes the current authentication, MIME, size, and per-IP controls while consuming Orba's Pinata quota and backend bandwidth.

**Impact:** Upload outages, unexpected storage/API cost, degraded token-launch UX, and possible broader backend resource pressure.

**Likelihood:** Moderate. The attack is inexpensive and does not require on-chain spend.

**Recommendation:** Add per-wallet hourly/daily byte and object quotas, global Pinata budget/circuit-breaker limits, content-hash deduplication, and monitoring/alerts. Consider reserving persistent uploads for wallets that have paid a launch fee or a short-lived signed launch intent. Apply distributed rate limiting at the edge, not solely process-local/IP throttling.

**References:** CWE-400; OWASP API4:2023 Unrestricted Resource Consumption.

### M-04 — Public RPC proxy permits high-amplification read workloads

**Severity:** Medium
**Location:** `apps/api/src/rpc/rpc.controller.ts:26-137`
**Category:** CWE-400 Uncontrolled Resource Consumption; availability

**Description:** The proxy correctly rejects write methods, caps batches at 20, bounds `eth_getLogs`, limits responses to 2 MB, and applies a ten-second upstream timeout. It nevertheless allows 300 HTTP requests per minute per IP and up to 20 RPC items per batch, including arbitrary `eth_call` and `eth_estimateGas`. This permits up to 6,000 potentially expensive calls per minute from one IP before distributed bypass, and provider rotation can spread abusive work across all configured RPC accounts.

**Attack scenario:** An attacker sends batches of computationally expensive `eth_call`/`eth_estimateGas` requests targeting contracts or calldata designed to consume the upstream execution budget. Parallel sources bypass the IP limit. Provider quotas are exhausted, degrading frontend reads and the indexer's ability to follow the chain.

**Impact:** Trading UI/read outages, receipt-confirmation delays, upstream quota exhaustion, and elevated infrastructure cost. Transactions remain wallet-signed and are not directly exposed through this endpoint.

**Likelihood:** Moderate. The endpoint is public and no wallet or application-level budget is required.

**Recommendation:** Use method-weighted token-bucket limits; set much lower batch and rate budgets for `eth_call`/`eth_estimateGas`; validate target addresses/selectors used by the UI where practical; cache deterministic common reads; cap request body/calldata and gas parameters; add concurrency limits and upstream per-provider budgets; put the proxy behind edge/WAF distributed rate limiting.

**References:** CWE-400; OWASP API4:2023.

### L-01 — Agent trade slippage is not bounded server-side

**Severity:** Low
**Location:** `apps/api/src/agents/agents.controller.ts:205-259`; `apps/api/src/agents/deployer.service.ts:661-870`
**Category:** Business logic; price/slippage protection

**Description:** An authenticated agent can provide any non-negative `slippageBps`. A value of `10_000` makes the minimum output zero; values near it provide negligible protection; values above it produce a negative BigInt expression that fails only later during unsigned transaction encoding. The feature is disabled in the live Render configuration (`AGENT_EXECUTOR_ENABLED=false`, `DEPLOYER_ACTIONS_ENABLED=false`), which materially lowers current risk.

**Attack scenario:** If funded actions are enabled, a compromised or malicious agent API key submits a buy/sell with 100% slippage. A searcher moves the curve price around the transaction and captures value from the platform-funded shared wallet within the agent/platform spend caps.

**Impact:** Loss of platform-funded trade value up to configured per-action/daily/monthly limits; avoidable request failures for values above 10,000 bps.

**Likelihood:** Low while disabled; moderate if enabled without validation.

**Recommendation:** Enforce an explicit policy such as `0 <= slippageBps <= 1_000`, reject zero-output protection, and apply a stricter server-controlled default/maximum independent of agent input. Add boundary and MEV-adversarial tests before enabling funded actions.

**References:** CWE-20 Improper Input Validation; OWASP Smart Contract SC06 slippage controls.

### L-02 — Timelock operations remain executable forever after becoming ready

**Severity:** Low
**Location:** `contracts/src/ProtocolTimelock.sol:66-103`
**Category:** Governance lifecycle; stale authorization

**Description:** A queued operation has a `readyAt` time but no expiry/grace period. Once ready, anyone can execute it indefinitely unless the admin Safe explicitly cancels it. Safe signer rotation or incident recovery does not invalidate forgotten queued operations.

**Attack scenario:** During a temporary Safe compromise, an attacker queues a harmful owner action. The team restores Safe control but overlooks the operation ID. Weeks later, the attacker or any third party executes the still-valid operation.

**Impact:** Delayed execution of stale privileged configuration, potentially including treasury/factory/migrator changes within the target contract's authority.

**Likelihood:** Low with monitoring and a 2-of-3 Safe; impact depends on the queued target/data.

**Recommendation:** Add a bounded execution grace period and explicit expired state. Monitor every queue/cancel/execute event, maintain an enumerable operation registry off-chain, and require an incident runbook step to cancel all outstanding operations after signer/security events.

**References:** CWE-613 Insufficient Session Expiration (analogous lifecycle principle); OpenZeppelin TimelockController operation lifecycle.

### L-03 — Direct AMM transfer-then-swap flow can be claimed or griefed

**Severity:** Low
**Location:** `contracts/src/AMMPair.sol:130-157`
**Category:** Transaction ordering; MEV/user integration safety

**Description:** The canonical router atomically transfers input and calls `swap`, which is safe for the supported UI flow. The pair's public `swap` still supports the classic staged pattern: a caller transfers tokens to the pair and then submits a separate swap. Any account can call `swap` or `sync` between those transactions, consuming the donation or incorporating it into reserves and causing the intended swap to fail.

**Attack scenario:** A user or third-party integration transfers input to the pair in one transaction. A bot front-runs the next transaction with `swap` to itself, or calls `sync`, leaving the user's tokens donated/trapped in pool reserves.

**Impact:** Loss of staged user input for integrations that bypass the router. The official frontend's atomic router path is not affected.

**Likelihood:** Low if integrations follow documented router usage; higher for naïve direct pair callers.

**Recommendation:** Clearly mark direct `swap` as unsafe for two-transaction use and expose only router instructions in public docs/ABIs. Consider restricting swaps to approved routers or redesigning the pair to pull declared input atomically if composability requirements permit.

**References:** SWC-114 Transaction Order Dependence; Uniswap V2 router integration model.

### L-04 — Release assurance uses a mutable action and stale contract addresses

**Severity:** Low
**Location:** `.github/workflows/release-gate.yml:12-23,61-63`
**Category:** CI/CD supply chain; configuration drift

**Description:** Most GitHub actions are pinned to commit SHAs, but `foundry-rs/foundry-toolchain@v1` uses a mutable tag. The web quality gate also builds with legacy contract addresses rather than the current hardened deployment. The workflow can therefore pass without validating the same address configuration served in production, while a future mutable-action compromise could execute code in CI. Workflow permissions are limited to `contents: read`, reducing impact.

**Attack scenario:** A compromised/mutated action runs unreviewed code in the contract job, or a production address regression passes CI because tests/build exercised stale legacy addresses.

**Impact:** Weakened release integrity and false confidence in deployment configuration; limited repository-token impact under current permissions.

**Likelihood:** Low.

**Recommendation:** Pin the Foundry action to a reviewed commit SHA. Source release-gate addresses from one versioned deployment manifest and assert they match `packages/shared`, `.env.example`, Render, and the expected on-chain bytecode hashes.

**References:** SLSA build integrity; GitHub Actions hardening guidance.

### L-05 — WebP validation checks only the generic RIFF prefix

**Severity:** Low
**Location:** `apps/api/src/upload/upload.controller.ts:52-70`
**Category:** CWE-434 Unrestricted Upload of File with Dangerous Type; validation

**Description:** A declared WebP is accepted when its first four bytes are `RIFF`. A valid WebP also requires a RIFF size field and `WEBP` at bytes 8-11. Many non-WebP RIFF files and crafted polyglots therefore pass this format check. Other formats similarly receive only short signature validation rather than full decoding.

**Attack scenario:** An authenticated user uploads a RIFF/polyglot payload labeled `image/webp`. Pinata stores and serves content that is not a valid WebP, enabling content-policy bypass and malformed preview behavior. Because it is served from an IPFS gateway origin, no same-origin script execution was demonstrated.

**Impact:** Storage of unintended content, broken image rendering, abuse/moderation burden, and contribution to M-03 quota abuse.

**Likelihood:** Moderate; impact is Low.

**Recommendation:** Decode and re-encode accepted images server-side, strip metadata, enforce pixel/dimension/decompression limits, and generate a canonical safe format. At minimum validate complete format signatures, including `WEBP` at bytes 8-11.

**References:** CWE-434; OWASP File Upload Cheat Sheet.

## 5. Domain analysis

### 5.1 Smart contracts and economic invariants

#### Trust boundary map

```text
2-of-3 Admin Safe
  ├─ immediate emergency pause only ──> TokenFactory.pauseGuardian
  └─ queue/cancel (48h) ──────────────> ProtocolTimelock
                                           ├─ owns TokenFactory
                                           ├─ owns AMMFactory
                                           ├─ owns LiquidityMigration
                                           └─ owns Treasury

User wallet ──approve/buy/sell──> BondingCurve
BondingCurve ──threshold trigger──> LiquidityMigration
LiquidityMigration ──fresh pair──> AMMFactory ──> AMMPair
LiquidityMigration ──LP tokens──> 0x...dEaD
User wallet ──atomic post-grad swap──> AMMRouter ──> AMMPair
Arc events ──public RPC──> indexer ──> PostgreSQL/Redis/WebSocket/frontend
```

#### Invariant register

| Invariant | Assessment |
|---|---|
| Token total supply remains 1B | Enforced by constructor-only mint; no later mint entrypoint |
| Curve cannot sell more than 880M | Enforced with partial-fill branch and `SUPPLY_ON_CURVE` cap |
| 120M tokens are reserved for AMM | Enforced by fixed constants and graduation transfer |
| Curve trading preserves virtual constant-product math | Covered by code review and Foundry tests |
| Buy/sell output respects caller minimum | Enforced in `BondingCurve`; official UI calculates minimums |
| Graduation is atomic | Pair creation, token graduation, liquidity mint, and LP burn revert together |
| Graduation cannot reuse attacker-seeded pair | Enforced by requiring no existing canonical pair and restricted pair creation |
| LP ownership cannot be withdrawn by the team | Migrator sends minted LP to `0x...dEaD`; minimum liquidity is locked |
| Token admin authority ends at graduation | `MemeToken.graduate` clears curve and renounces ownership |
| AMM reserve product does not decrease | Enforced by `balance0 * balance1 >= reserve0 * reserve1` |
| Off-chain AMM input equals canonical asset delta | **Violated by M-01** |
| Treasury/config changes are delayed | Enforced through timelock ownership; emergency pause is immediate but one-way |

#### External-call inventory

- `TokenFactory.createToken`: deploys curve/token and calls Arc USDC `transferFrom` after state construction; revert is atomic.
- `BondingCurve.buy/sell/claims/graduation`: calls Arc USDC and MemeToken; reentrancy guard covers value-moving public trade/claim paths.
- `LiquidityMigration.checkAndMigrate`: calls factory, curve, token, USDC, pair factory, and pair. State and value changes are atomic.
- `AMMPair`: calls both asset contracts for `mint`, `burn`, and output transfers. Non-reentrant value-moving methods are used.
- `AMMRouter`: validates canonical pairs, deadline, output minimum, and atomically transfers input before pair swap.
- `Treasury`: owner-only arbitrary ERC-20 withdrawal and limited curve actions; owner is the timelock.
- `ProtocolTimelock.execute`: arbitrary target call after delay; deletes operation before call and guards reentrancy.

### 5.2 Launchpad rug-pull resistance scorecard

| Control | Result | Notes |
|---|---|---|
| Fixed supply / no hidden mint | Pass | 1B supply minted once to curve |
| No team presale/allocation | Pass | Entire supply starts on curve; 12% reserved for AMM |
| No blacklist/freeze/selective trading | Pass | No blacklist; pre-graduation cooldown is uniform |
| Creator cannot withdraw liquidity | Pass by design | LP burned to dead address |
| Attacker cannot pre-seed graduation pair | Pass | Fresh canonical pair required; pair creators restricted |
| Creator cannot change curve economics | Pass | Constants fixed per curve |
| Protocol admin is multisig + delay | Pass | 2-of-3 Safe and 48-hour timelock verified on-chain |
| Emergency stop is narrow | Pass | Safe may pause launches; cannot unpause/reconfigure immediately |
| Contract source publicly verified | **Fail** | M-02 |
| Deployed production-threshold graduation | **Incomplete** | I-03 |
| Independent external audit | **Incomplete** | Required before mainnet |

### 5.3 API, indexer, custody, and operations

Positive controls observed:

- SIWE binds domain, URI, chain, issued/expiry time, and a single-use Redis nonce.
- Auth fails closed without `AUTH_SECRET`; insecure auth is disabled in production configuration.
- Agent API keys are hashed; funded actions use durable intents, KMS signer address verification, serialized signing, per-agent position reservations, and platform-wide spend caps.
- Funded agent actions are disabled live.
- RPC write methods are rejected; `eth_getLogs`, batch size, response size, and upstream timeout are bounded.
- Indexer scope rejects legacy/untrusted factories and untrusted migration emitters.
- Readiness checks PostgreSQL, Redis, and RPC; the live endpoint returned ready.
- Production dependencies reported zero known vulnerabilities through `npm audit --omit=dev` at assessment time.
- Backup workflow encrypts output, validates a restore, pins the Supabase CA checksum, and uploads encrypted artifacts.

Residual concerns are M-01, M-03, M-04, L-01, L-04, and L-05.

### 5.4 Frontend and transaction safety

- CSP uses a request nonce and `strict-dynamic`; frame ancestors are denied; HSTS and `X-Frame-Options: DENY` were live.
- The official post-graduation flow uses `AMMRouter` with a 20-minute deadline and computed minimum output.
- Curve trades include caller minimum output.
- Transactions pin the Arc chain ID and expose network switching.
- Production build fails closed when required address/API variables are absent.
- The audited production-address build succeeded.

The frontend cannot protect integrations that bypass the router (L-03), and CI currently does not build against the same hardened addresses (L-04).

## 6. Verification evidence

### Automated checks

| Check | Result |
|---|---|
| `forge test --root contracts` | 59 passed, 0 failed after remediation |
| `forge lint --root contracts` | Passed; warnings limited to test code |
| API Jest suite | 144 passed, 0 failed |
| Frontend Vitest suite | 149 passed, 0 failed |
| TradingView asset-integrity tests | 4 passed, 0 failed |
| API production build | Passed |
| Frontend production-address build | Passed |
| `npm audit --omit=dev` | 0 known production dependency vulnerabilities |
| GitHub release gate at audited revision | Passed |

### Live/deployed checks

- `https://orba.fun` returned HTTP 200 with CSP, HSTS, and clickjacking protection.
- `https://orbafun-api.onrender.com/health/ready` returned PostgreSQL, Redis, and RPC healthy.
- `/upload/status` reported Pinata uploads enabled.
- RPC `eth_blockNumber` succeeded; `eth_sendRawTransaction` was rejected with HTTP 403.
- Safe version `1.4.1`, threshold 2, three owners.
- Timelock delay 172,800 seconds and admin equal to the Safe.
- Treasury owner equal to the timelock.
- TokenFactory, AMMFactory, and LiquidityMigration owners equal to the timelock.
- TokenFactory points to the expected Treasury and Migrator and is not paused.
- Pause guardian equals the Safe.
- AMMFactory authorizes the expected Migrator as pair creator.
- Router and Migrator point to the expected AMMFactory/TokenFactory.
- Runtime-bytecode matching was available from the prior deployment verification evidence; contract source remained unchanged between that deployment snapshot and the audited revision.

## 7. Remediation roadmap

### Before any additional public testnet promotion

1. Fix M-01 and add the forged-transfer adversarial regression test.
2. Replay/rebuild AMM-derived data from the deployment block after deploying the indexer fix.
3. Source-verify all deployed contracts and publish compiler/build metadata (M-02).
4. Add upload per-wallet/global budgets and correct content decoding (M-03, L-05).
5. Reduce and weight RPC proxy budgets (M-04).

### Before enabling platform-funded agents

1. Enforce server-side slippage bounds (L-01).
2. Run sandwich/adverse-price tests against action and platform caps.
3. Complete KMS IAM, balance-cap, reconciliation, and incident drills against the exact production configuration.

### Before mainnet or meaningful user funds

1. Complete a deployed production-threshold graduation and post-graduation router trade using the exact release contracts.
2. Add timelock expiry and outstanding-operation monitoring (L-02).
3. Pin the remaining CI action and unify the deployment manifest (L-04).
4. Commission an independent credentialed smart-contract and full-stack audit; remediate and retest every accepted finding.
5. Freeze an immutable release candidate with runtime hashes, verified source, environment manifest, Safe owners/threshold, timelock state, monitoring, backup-restore evidence, and rollback/runbook evidence.

## 8. Appendix: informational observations

### I-01 — Zero-fee permanent AMM

The AMM charges 0% swap fees and the protocol burns all LP. This prevents later LP withdrawal but gives the permanent liquidity position no fee income and gives arbitrageurs all price-dislocation value. This is an explicit economic design choice, not a demonstrated code exploit. Model long-run liquidity decay, toxic flow, and price-discovery behavior before mainnet.

### I-02 — Unused `feeSetter`

`AMMFactory.feeSetter` remains the deployer EOA, but no function currently uses it. It is not an active privilege in this revision. Remove or document it to avoid false assumptions during incident response and external review.

### I-03 — Deployed graduation evidence gap

The local automatic graduation and post-graduation router canary passes. The Arc fork test named `test_FullGraduationE2E` explicitly stops short of the production threshold because it lacks the required test USDC. A launch-buy-sell canary is not equivalent to deployed full graduation. Treat this rehearsal as a release gate, not optional evidence.

---

This report is a point-in-time security assessment, not a warranty that the system is vulnerability-free. Any contract, address, environment, dependency, governance, or infrastructure change invalidates parts of the assessment and should trigger targeted re-review.
