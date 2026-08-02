# Orba Launchpad Security Audit

**Assessment date:** 2026-08-01
**Target:** Orba launchpad repository and Arc testnet deployment
**Assessment type:** Source-assisted, read-only application and smart-contract security review
**Overall posture:** **Not ready for mainnet**

## 1. Executive Summary

Orba has a stronger contract foundation than most early-stage launchpads: fixed token supply, no token blacklist or creator mint authority, on-chain slippage checks, reentrancy protection, atomic graduation, renounced token ownership, and burned LP tokens. All 33 Foundry tests, 23 API tests, and 101 web tests passed during this review; both production builds also completed.

The review found **5 high**, **8 medium**, and **5 low** findings. No critical issue was confirmed. The most urgent risks are outside the core bonding-curve math:

1. Concurrent agent requests can bypass spending limits and spend from the shared platform deployer.
2. Permissionless creation of funded agents creates a Sybil path to drain that deployer even if the race is fixed.
3. The Arc event poller accepts topic-matching graduation logs from arbitrary contracts, allowing backend/UI graduation spoofing.
4. A single EOA owns every deployed administrative contract and the platform also uses a hot deployer key.
5. The production dependency tree contains 8 high and 30 moderate advisories requiring version-by-version remediation.

**Launch recommendation:** keep Orba on Arc testnet. Do not enable funded self-service agents or deploy to mainnet until all High findings are closed, the Medium indexer/authentication issues are fixed, a multisig and operational controls are in place, and an independent smart-contract audit has been completed.

## 2. Scope & Limitations

### In scope

- Solidity contracts in `contracts/src`, deployment scripts, and Foundry tests.
- NestJS API, authentication, agent/deployer system, direct Arc RPC indexer, Redis/WebSocket pipeline, RPC proxy, and PostgreSQL schema.
- Next.js frontend wallet authentication, approvals, transaction initiation, security headers, and token display data flow.
- Render/Vercel configuration present in the repository and read-only checks of the live testnet deployment.
- Production dependency advisory scan.

### Out of scope / limitations

- No destructive, exploit, load, fund-moving, or social-engineering tests were performed against live infrastructure.
- No private Render, Vercel, Supabase, wallet, or third-party account configuration was changed.
- Slither was unavailable, so Solidity static analysis was not run. Manual review and Foundry tests were used instead.
- No source verification comparison against an explorer was completed.
- The assessment does not prove absence of vulnerabilities and is not a substitute for an independent third-party audit before mainnet.

## 3. Findings Summary

### Remediation checkpoint — 2026-08-01

- **ORB-H01 fixed in source:** atomic per-agent spend reservations now serialize limit checks and count pending operations.
- **ORB-H02 fixed in source:** funded template deployment is protected by `AdminGuard`; the environment flag can no longer expose it publicly.
- **ORB-H03 fixed in source:** factory and curve events are rejected unless emitted by the configured factory or a registered curve.
- **ORB-H04 operationally remediated on Arc testnet:** deployment and ownership-transfer scripts require `ADMIN_MULTISIG`, and Treasury, AMMFactory, TokenFactory, and LiquidityMigration are owned by Safe `0x33E4bd4561EE669012ff83b4eE5609122838bDcB`. The Safe has three independently keyed owners and currently requires 2-of-3 confirmations.
- **ORB-H05 fixed:** the installed production dependency tree now reports `0 vulnerabilities` from `npm audit --omit=dev`.

Verification at this checkpoint: API and web production builds pass, 16/16 API tests pass, and 33/33 Foundry tests pass.

### Remediation checkpoint — 2026-08-02

All Medium and Low findings have now been remediated in source. Deployment-dependent items are explicitly separated from source closure:

- **ORB-M01/M02:** event processing now stops on duplicate inserts before any aggregate side effect; the duplicate user-volume trigger is removed; explicit `BuyV2`/`SellV2` events carry gross, fee, and net amounts. The active Arc poller supports both legacy and V2 deployments.
- **ORB-M03/M04:** SIWE fields are domain/URI/chain/time-bound with atomic Redis nonces; tips require a normalized unique transaction hash and a confirmed exact USDC transfer before storage or aggregation.
- **ORB-M05/M06:** PostgreSQL/Redis verify TLS certificates; migrations provision a non-owner `NOBYPASSRLS` runtime role with explicit RLS policies; RPC batches, log filters, time, addresses, and streamed response bytes are bounded.
- **ORB-M07/M08:** browser and deployer approvals are exact-amount (including reset of legacy broad allowances); AMMRouter requires the canonical factory pair, exact USDC pairing, code-bearing addresses, and a deadline.
- **ORB-L01–L05:** the embedded RPC credential is removed; factory configuration and migration balance isolation are enforced; browser auth tokens are memory-only under nonce CSP; WebSocket client identity uses trusted proxy hops and Redis-backed cross-instance connection slots; RLS is part of the automatic migration.

Deployment status:

- The API/Render deployment must run the updated migration and use `POSTGRES_RUNTIME_PASSWORD`; runtime startup now fails closed in production without it or when the connected role bypasses RLS.
- Contract fixes in ORB-M02, ORB-M08, ORB-L02, and ORB-L03 require a new audited contract deployment; existing Arc testnet bytecode is unchanged.
- ORB-H04 is operationally closed on Arc testnet. On-chain `owner()` reads confirm Treasury, AMMFactory, TokenFactory, and LiquidityMigration are owned by Safe `0x33E4bd4561EE669012ff83b4eE5609122838bDcB`; Safe reads and the Safe Transaction Service confirm three owners, threshold 2, and Safe version 1.4.1+L2. Ownership-transfer transactions: Treasury `0xfbd04906e72e21b7131d8260296a13b8b60dccf8ceb4585dc82a97a0710ab8c7`; AMMFactory `0xa0923ce8efeabc86e848ee5d5feb6a0fb2015d1188425a4396bf74a2d861f624`; TokenFactory `0x62855c56476745e1dec7a8dccee93e18a4c52be4ff72fdc79b996c869ea9a476`; LiquidityMigration `0x62a6f8063caaf9eff11d1d434cb54aac86ad12ae009c6a2dfbfe635f9c9483ed`.
- The optional, disabled Envio fallback was updated for V2 event definitions, but Envio code generation could not be validated on Windows because its CLI failed internally with `Cannot read properties of null (reading 'runCli')`. The production direct Arc poller is the supported active path.

Verification at this checkpoint: API build passed; API tests **25/25** passed; web type-check and production Webpack build passed; web tests **102/102** passed; Foundry tests **40/40** passed; production dependency audit reports **0 vulnerabilities**. A local production response returned nonce/`strict-dynamic` script CSP with no script `unsafe-inline`, and its inline theme script carried the matching nonce.

| ID | Severity | Finding | Primary impact |
|---|---|---|---|
| ORB-H01 | High | Agent spending limits are not atomic | Shared deployer fund loss |
| ORB-H02 | High | Self-service funded agents enable Sybil depletion | Shared deployer fund loss |
| ORB-H03 | High | Arbitrary contracts can spoof graduation events | False market state / malicious pair routing |
| ORB-H04 | High | Single EOA controls all privileged contracts | Total administrative compromise |
| ORB-H05 | High | Vulnerable production dependency tree | API/frontend compromise depending on reachability |
| ORB-M01 | Medium | Indexing is not idempotent and user volume is double-counted | Corrupted financial/leaderboard data |
| ORB-M02 | Medium | Buy/sell event semantics drift from indexed accounting | Incorrect reserves, fees, and volume |
| ORB-M03 | Medium | Wallet authentication is not fully SIWE-bound | Domain/chain confusion and phishing risk |
| ORB-M04 | Medium | Unverified tips affect public statistics | Leaderboard and reputation manipulation |
| ORB-M05 | Medium | Database and Redis TLS certificates are not verified | Credential/data interception |
| ORB-M06 | Medium | RPC proxy accepts unbounded batches and log queries | Quota exhaustion / API denial of service |
| ORB-M07 | Medium | Frontend and deployer grant unlimited approvals | Expanded loss after spender compromise |
| ORB-M08 | Medium | AMMRouter accepts arbitrary, non-canonical pairs | Wrong-token or malicious-pair interaction |
| ORB-L01 | Low | Third-party RPC credential is embedded in source | Quota theft and provider denial |
| ORB-L02 | Low | Factory configuration can permanently block graduation | Token liveness failure |
| ORB-L03 | Low | Migration consumes entire contract balances | Cross-operation accounting contamination |
| ORB-L04 | Low | Browser auth token is exposed to XSS and CSP permits inline script | Session theft after XSS |
| ORB-L05 | Low | Proxy/WebSocket and migration hardening gaps | Rate-limit bypass and policy drift |

## 4. Detailed Findings

### [HIGH] ORB-H01 — Agent spending limits are not atomic
- **Location:** `apps/api/src/agents/agents.service.ts:166-226`, `634-694`, `814-880`
- **Category:** CWE-362 race condition; authorization/accounting
- **Description:** `checkSpendingLimit()` claims to use `SELECT FOR UPDATE`, but no locking query exists. It reads aggregate spend, commits, then evaluates the limit. The on-chain transaction and spend record occur later in a separate operation.
- **Attack scenario:** An agent submits several launch or buy requests concurrently. Every request observes the same pre-spend total, every request passes, and each uses the shared deployer wallet before any one result is recorded.
- **Impact:** Per-agent daily/monthly limits can be exceeded and platform-controlled USDC can be drained.
- **Likelihood:** High while agent launch/buy endpoints are available.
- **Recommendation:** Add an atomic reservation ledger. Lock the agent or a per-agent budget row, validate and reserve the requested amount in one transaction, then settle or release the reservation after the chain result. Add request idempotency keys and concurrent regression tests. Do not rely on an aggregate `SUM()` followed by a later insert.
- **References:** CWE-362; OWASP Transaction Authorization guidance.

### [HIGH] ORB-H02 — Self-service funded agents enable Sybil depletion
- **Location:** `apps/api/src/agents/agents.controller.ts:398-423`, `apps/api/src/agents/template.service.ts:128-147`, `apps/api/src/agents/agents.service.ts:90-132`
- **Category:** Business-logic abuse; broken resource authorization
- **Description:** Any authenticated wallet can deploy an agent from a public template and receive an API key. Each new agent receives independent spending limits while transactions are paid by one shared platform deployer. There is no owner-wide/platform-wide budget, stake, payment, invite, or allowlist.
- **Attack scenario:** An attacker creates many wallets and agents, optionally rotates IPs, then consumes each agent's allowance through launches or buys.
- **Impact:** The shared deployer can be depleted even after ORB-H01 is fixed.
- **Likelihood:** High if self-service deployment is enabled with a funded deployer.
- **Recommendation:** Disable `deploy-self` in funded environments until global platform caps, per-owner aggregate caps, paid/staked creation, allowlisting or invitation, strong abuse controls, and emergency circuit breakers exist. Store a kill switch separately from the autonomous executor flag.
- **References:** OWASP API4:2023 Unrestricted Resource Consumption; OWASP API6:2023 Unrestricted Access to Sensitive Business Flows.

### [HIGH] ORB-H03 — Arbitrary contracts can spoof graduation events
- **Location:** `apps/api/src/indexer/arc-event-poller.service.ts:226-232`, `342-359`, `apps/api/src/indexer/indexer.service.ts:442-475`
- **Category:** CWE-345 insufficient verification of data authenticity
- **Description:** The poller performs a whole-chain topic-only fallback query for `Buy`, `Sell`, and `Graduated`. A matching `Graduated` log is processed without verifying that its emitter is a known Orba curve or that the token, curve, and AMM pair are canonical. The handler directly marks the named token graduated and stores the supplied pair.
- **Attack scenario:** A malicious contract emits the same graduation signature with a real Orba token address and attacker-controlled pair address. The backend marks the real token graduated and the frontend can display or route users toward false market data.
- **Impact:** Trading availability and token state can be falsified; users may be directed to a malicious pair.
- **Likelihood:** Medium to high because emitting a matching log is permissionless and inexpensive.
- **Recommendation:** Remove the topic-only fallback for graduation. Query only registered curve addresses, verify `log.address` against the database and TokenFactory state, and verify the pair through the canonical AMMFactory/migrator before committing. Treat chain events as untrusted input and add a malicious-emitter test.
- **References:** CWE-345; Ethereum log/event authenticity principles.

### [HIGH] ORB-H04 — Single EOA controls all privileged contracts
- **Location:** `contracts/script/DeployArcFun.s.sol:50-58`, `contracts/src/TokenFactory.sol:190-217`, `contracts/src/Treasury.sol`; Arc testnet deployment
- **Category:** Privileged access and key management; centralization risk
- **Description:** Read-only testnet calls confirmed `0x74E9...f337` owns TokenFactory, Treasury, AMMFactory, and LiquidityMigration. The deployment script explicitly defers multisig ownership. The owner can pause creation, change fee/treasury/migrator configuration, and withdraw treasury balances. A separate hot deployer key is used by the API.
- **Attack scenario:** Theft of the EOA or server-side deployer key gives an attacker broad control over configuration, treasury funds, or platform-funded agent activity.
- **Impact:** Administrative takeover, treasury loss, denial of service, and unsafe configuration. This is a mainnet launch blocker.
- **Likelihood:** Medium; impact is high enough to require prevention before mainnet.
- **Recommendation:** Transfer all ownership to a hardware-backed multisig; separate treasury, pause guardian, and deployment roles; add a timelock for non-emergency configuration; cap fee changes; require non-zero/canonical addresses; minimize and monitor the hot deployer balance; document emergency rotation and pause procedures.
- **References:** Consensys Smart Contract Best Practices — access control; OWASP Secrets Management.

### [HIGH] ORB-H05 — Vulnerable production dependency tree
- **Location:** Root lockfile and production dependency graph
- **Category:** CWE-1104 use of unmaintained or vulnerable components
- **Description:** `npm audit --omit=dev` reported 38 production-tree advisories: 8 high and 30 moderate. High paths include NestJS/platform-express/multer, Next.js transitive packages, Axios, and WebSocket-related dependencies. The tree also contains a Nest 10 runtime with an incompatible Nest 11 testing peer dependency.
- **Attack scenario:** An attacker reaches a vulnerable parsing, upload, HTTP, WebSocket, or frontend code path covered by one of the advisories.
- **Impact:** Depends on advisory reachability and ranges; potential denial of service, request smuggling/parsing issues, or application compromise.
- **Likelihood:** Medium. Automated results require reachability triage, but high advisories should not ship unreviewed.
- **Recommendation:** Upgrade to supported patched versions, align all Nest packages to one major, deduplicate the lockfile, confirm the actual multer instance used by Nest upload handling, rerun unit/E2E tests, and gate CI on production audit results with documented exceptions.
- **References:** npm advisory database; OWASP A06:2021 Vulnerable and Outdated Components.

### [MEDIUM] ORB-M01 — Indexing is not idempotent and user volume is double-counted
- **Location:** `apps/api/src/indexer/indexer.service.ts:171-250`, `324-402`; `apps/api/db/schema.sql:178-194`
- **Category:** CWE-20 data integrity; replay/idempotency
- **Description:** Trade inserts use `ON CONFLICT DO NOTHING`, but token, user, and referral updates execute even when the trade already existed. In addition, the database trigger increments user volume on a successful trade insert and the service increments it again manually, doubling volume on every normal event.
- **Attack scenario:** A poller reset, webhook replay, restart overlap, or duplicate delivery reprocesses an existing event. The trade remains unique, while aggregates increase again. Normal first-time processing already double-counts user volume.
- **Impact:** Corrupted market stats, user rankings, referral rewards, and financial reporting.
- **Likelihood:** High over the lifetime of an indexer.
- **Recommendation:** Use `INSERT ... ON CONFLICT DO NOTHING RETURNING ...` and execute all side effects only when a row is returned. Choose either the trigger or service update, not both. Add replay, restart, and duplicate-delivery tests.
- **References:** Idempotent consumer pattern; CWE-20.

### [MEDIUM] ORB-M02 — Buy/sell event semantics drift from indexed accounting
- **Location:** `contracts/src/BondingCurve.sol:228-253`, `275-299`; `apps/api/src/indexer/indexer.service.ts:135-267`, `294-416`
- **Category:** Financial accounting integrity
- **Description:** A partial-fill buy emits the originally requested `usdcAmount` even if part was refunded. A sell event emits net `usdcOut` after fee, while the indexer treats it as gross, calculates another fee, and reduces indexed reserves by the wrong amount.
- **Attack scenario:** Near graduation, a buy is partially filled and refunded; indexed volume/reserves are overstated. Every sell creates a smaller but persistent divergence between on-chain and database accounting.
- **Impact:** Incorrect displayed market data, fee totals, referrals, and analytics; no direct on-chain fund loss was shown.
- **Likelihood:** Certain for sells and partial-fill buys.
- **Recommendation:** Emit explicit actual input, gross output, fee, and net output values, or derive them from authoritative transfer logs/on-chain state. Update the indexer and add invariant tests comparing indexed reserves/fees to contract state after buy, partial buy, sell, and replay.
- **References:** Financial event-sourcing consistency principles.

### [MEDIUM] ORB-M03 — Wallet authentication is not fully SIWE-bound
- **Location:** `apps/api/src/auth/auth.service.ts:65-90`, `148-160`; `apps/web/src/lib/use-auth.ts:122-141`
- **Category:** CWE-346 origin validation; authentication design
- **Description:** The server recovers the signer and searches the arbitrary message text for any issued nonce. It does not parse and validate EIP-4361 domain, URI, chain ID, issued time, expiration, or claimed address. Nonces are stored in a process-local map rather than an atomic shared store.
- **Attack scenario:** A phishing or host-confused message containing a currently valid Orba nonce is accepted even when its stated domain/chain is wrong. Multiple API replicas can issue/consume nonce state inconsistently.
- **Impact:** Weakened phishing resistance and authentication reliability; replay is limited by nonce deletion on the accepting instance.
- **Likelihood:** Medium.
- **Recommendation:** Use a maintained SIWE/EIP-4361 parser and validate domain, URI, chain ID 5042002, address, nonce, issued-at, and expiration. Store nonces in Redis with an atomic one-time consume and short TTL. Bind the expected host to environment configuration.
- **References:** EIP-4361; CWE-346.

### [MEDIUM] ORB-M04 — Unverified tips affect public statistics
- **Location:** `apps/api/src/agents/agents.controller.ts:503-526`, `apps/api/src/agents/tip.service.ts:19-111`, `apps/api/src/agents/agents.service.ts:330-347`
- **Category:** CWE-345; business-logic integrity
- **Description:** The tips endpoint accepts an optional transaction hash. When absent, it still inserts the tip. No environment guard restricts this test behavior, and public leaderboard totals aggregate all rows without a verified flag/filter.
- **Attack scenario:** An authenticated wallet submits large arbitrary tip amounts without transferring USDC, inflating agent tips and leaderboard placement.
- **Impact:** Reputation, ranking, and analytics manipulation; database errors are also possible for out-of-range values.
- **Likelihood:** High if the endpoint is public.
- **Recommendation:** Require a transaction hash in deployed environments, verify chain/recipient/amount/token/confirmations, persist verification status, count only verified rows, enforce amount bounds, and make transaction hashes globally unique.
- **References:** CWE-345; OWASP API6:2023.

### [MEDIUM] ORB-M05 — Database and Redis TLS certificates are not verified
- **Location:** `apps/api/src/database/database.service.ts:25-43`, `apps/api/src/db/migrate.ts:20-29`, `apps/api/src/redis/redis.service.ts:35-45`
- **Category:** CWE-295 improper certificate validation
- **Description:** Remote PostgreSQL and TLS Redis connections set `rejectUnauthorized: false`. The runtime database role observed during the review has RLS bypass capability, increasing the effect of stolen credentials.
- **Attack scenario:** A network or DNS attacker presents an untrusted certificate, intercepts credentials, tampers with query/pub-sub traffic, or impersonates infrastructure.
- **Impact:** Database or session compromise and corrupted indexer/event data.
- **Likelihood:** Low to medium depending on hosting network, but the configuration intentionally removes authentication.
- **Recommendation:** Enable certificate verification with the provider CA/system trust store. Split migration and runtime roles, give the runtime role only required privileges, and avoid a role with RLS bypass.
- **References:** CWE-295; OWASP Cryptographic Failures.

### [MEDIUM] ORB-M06 — RPC proxy accepts unbounded batches and log queries
- **Location:** `apps/api/src/rpc/rpc.controller.ts:54-104`
- **Category:** CWE-400 uncontrolled resource consumption
- **Description:** One HTTP request may contain an arbitrarily large JSON-RPC batch. Whitelisted calls such as `eth_getLogs` are not constrained by block span, address count, or response size. The HTTP rate limiter therefore does not represent upstream work.
- **Attack scenario:** An unauthenticated client submits very large batches or wide log scans, exhausting Arc provider quotas, memory, and API worker time.
- **Impact:** Frontend reads and indexer availability degrade or fail.
- **Likelihood:** High for an internet-exposed endpoint.
- **Recommendation:** Cap batch length and body size, validate each method's parameter schema, restrict log block range/address count, set upstream timeouts and response caps, cache safe reads, and add a separate work-weighted quota.
- **References:** CWE-400; OWASP API4:2023.

### [MEDIUM] ORB-M07 — Frontend and deployer grant unlimited approvals
- **Location:** `apps/web/src/components/TradePanel.tsx:287-306`, `apps/web/src/app/launch/page.tsx:170-183`, `apps/api/src/agents/deployer.service.ts`
- **Category:** Token allowance exposure; transaction authorization
- **Description:** User and deployer flows grant `maxUint256` allowances. The reviewed contracts are non-upgradeable and pull bounded values, which reduces present risk, but the approval remains broader and longer-lived than the action requires.
- **Attack scenario:** A configured spender address is replaced, a spender contract bug is discovered, or a malicious frontend persuades a user to approve the wrong curve; the full approved balance is exposed.
- **Impact:** Loss of all approved USDC/token balance for the affected owner.
- **Likelihood:** Low to medium; impact supports Medium severity.
- **Recommendation:** Prefer exact approvals or bounded reusable caps, reset sensitive deployer allowances after operations where practical, verify spender addresses against canonical factory state, and expose approval status/revocation guidance in the UI. Simulate writes before requesting signatures.
- **References:** ERC-20 allowance race/exposure guidance.

### [MEDIUM] ORB-M08 — AMMRouter accepts arbitrary, non-canonical pairs
- **Location:** `contracts/src/AMMRouter.sol:54-104`, `145-149`
- **Category:** CWE-20 improper input validation; smart-contract integration
- **Description:** The caller supplies any pair address. `_otherToken()` does not require that exactly one pair token is the configured USDC, and the router does not validate the pair through AMMFactory. The router is not yet deployed, so this is a pre-deployment issue.
- **Attack scenario:** A user or compromised UI passes a malicious/non-USDC pair while the router has allowance. The transaction can transfer assets into an unintended contract or return an unexpected token.
- **Impact:** User asset loss or incorrect swaps.
- **Likelihood:** Medium after deployment without canonical frontend enforcement.
- **Recommendation:** Add immutable factory validation, require exactly one side of the pair to be USDC, require `factory.getPair(token, USDC) == pair`, reject zero/code-less addresses, and add a deadline parameter. Test malicious pair implementations.
- **References:** SWC-122; CWE-20.

### [LOW] ORB-L01 — Third-party RPC credential is embedded in source
- **Location:** `apps/api/src/indexer/arc-event-poller.service.ts:91`, `apps/web/src/lib/config.ts:23`
- **Category:** CWE-798 hardcoded credential
- **Description:** An Alchemy RPC API key is committed as a fallback URL in backend and public frontend code. It is not a wallet secret, but anyone can consume its quota.
- **Attack scenario:** A third party extracts the key, sends high-volume requests, and exhausts or bills the provider account.
- **Impact:** Provider throttling, quota cost, or RPC outage.
- **Likelihood:** High because frontend code is public by design.
- **Recommendation:** Rotate/revoke the exposed key, remove it from source, use server-side environment configuration, and apply provider-side origin/IP/method/rate restrictions. Do not place a private RPC credential in `NEXT_PUBLIC_*` data.
- **References:** CWE-798.

### [LOW] ORB-L02 — Factory configuration can permanently block graduation
- **Location:** `contracts/src/TokenFactory.sol:108-117`, `190-211`; `contracts/src/BondingCurve.sol:123-126`
- **Category:** Configuration and liveness
- **Description:** Factory setters accept zero addresses and creation fee is unbounded. A curve created while `migrator` is zero cannot be repaired by the owner because only the factory contract may call the curve's one-time `setMigrator()` and the factory exposes no repair function.
- **Attack scenario:** An operational mistake or compromised admin clears the migrator, launches tokens, then restores it. Those already-created curves cannot graduate.
- **Impact:** Permanent liveness failure for affected tokens and potentially trapped trading state.
- **Likelihood:** Low with current non-zero testnet configuration.
- **Recommendation:** Reject zero/codeless addresses, require a migrator before token creation, cap fee changes, add a timelocked safe repair path before launch, and test configuration transitions.
- **References:** SWC-123; secure configuration principles.

### [LOW] ORB-L03 — Migration consumes entire contract balances
- **Location:** `contracts/src/LiquidityMigration.sol:88-115`
- **Category:** Accounting isolation
- **Description:** Migration uses the migrator's entire token and USDC balances rather than per-call balance deltas or expected amounts.
- **Attack scenario:** Stray/donated assets or leftovers are unintentionally included in the next pool, altering its initial price or subsidizing another token.
- **Impact:** Accounting contamination; no direct theft path was confirmed.
- **Likelihood:** Low because migrations are sequential and atomic.
- **Recommendation:** Measure pre/post deltas, pass and validate expected amounts, reject unsupported leftovers, and provide controlled recovery for unrelated tokens.
- **References:** Smart-contract balance accounting best practices.

### [LOW] ORB-L04 — Browser auth token is exposed to XSS and CSP permits inline script
- **Location:** `apps/web/src/lib/use-auth.ts:7-108`; live response `Content-Security-Policy`
- **Category:** CWE-922 insecure storage; XSS defense in depth
- **Description:** The 24-hour wallet-auth token is stored in `localStorage`. The live CSP contains `script-src 'self' 'unsafe-inline'`. No dangerous raw HTML rendering was found, and React escaping lowers current likelihood, but any future XSS gains direct access to tokens.
- **Attack scenario:** A vulnerable dependency or new injection bug runs script in the Orba origin and exfiltrates the auth token.
- **Impact:** Session takeover for wallet-authenticated off-chain actions until expiration.
- **Likelihood:** Low based on current code, with potentially meaningful impact.
- **Recommendation:** Prefer Secure, HttpOnly, SameSite cookies with CSRF protection, or shorten/token-bind browser sessions. Move CSP to nonces/hashes and remove `unsafe-inline` for scripts. Add CSP reporting.
- **References:** OWASP HTML5 Security; CWE-922.

### [LOW] ORB-L05 — Proxy/WebSocket and migration hardening gaps
- **Location:** `apps/api/src/websocket/websocket.gateway.ts:100-141`, `apps/api/src/db/migrate.ts`, `apps/api/db/fix_supabase_linter_security.sql`
- **Category:** Defense in depth; deployment drift
- **Description:** WebSocket per-IP limits trust the first `X-Forwarded-For` value and are process-local. Separately, RLS hardening lives in a standalone SQL file that is not visibly executed by the normal migration command. Live tables currently showed RLS enabled, but future schema deployment can drift.
- **Attack scenario:** If the edge proxy does not sanitize forwarded headers, clients spoof IPs to bypass connection caps. A future table is deployed without the manually applied RLS hardening.
- **Impact:** Resource exhaustion or unintended direct database exposure.
- **Likelihood:** Low and deployment-dependent.
- **Recommendation:** Configure framework proxy trust for Render's documented hop count, derive client IP only from trusted proxy metadata, use Redis/global connection quotas, and place all security policy changes in the versioned automatic migration path with CI assertions.
- **References:** OWASP API4:2023; PostgreSQL row security documentation.

## 5. Domain-Specific Assessment

### Trust boundary map

```text
User wallet
  | signed auth message / signed chain transaction
  v
Next.js frontend (Vercel) ---- read JSON-RPC ----> Nest API /rpc proxy
  | REST + bearer token                            | provider rotation
  v                                                v
Nest API (Render) <---- Redis pub/sub ---- Direct Arc RPC providers
  |     | shared hot deployer                        |
  |     +------------------------------ signed tx -->|
  | PostgreSQL                                      v
  +<---- indexed events ---- ArcEventPoller ---- Arc contracts
                                                  | Factory / Curve / AMM
                                                  v
                                               Treasury
```

Highest-risk transitions are: arbitrary chain logs into trusted database state, concurrent API calls into the shared deployer, wallet signatures into custom authentication, and privileged EOA/hot-key control over contracts and funds.

### Rug-pull risk scorecard

| Control | Status | Assessment |
|---|---|---|
| Fixed token supply | Pass | Supply minted once; no public mint path found. |
| Creator admin/blacklist | Pass | No creator-controlled blacklist, tax, pause, or mint authority found. |
| Bonding-curve slippage | Pass | `minTokensOut` / `minUsdcOut` enforced on-chain. |
| Max-wallet/cooldown | Pass with disclosure | Restrictions exist pre-graduation and are removed at graduation; document parameters clearly. |
| LP custody after graduation | Pass | LP is burned to `0x...dEaD` atomically. |
| Token ownership after graduation | Pass | Ownership is renounced. |
| Treasury custody | Pass with caveat | Arc testnet ownership moved to a 2-of-3 Safe; add monitoring, hardware-backed production signers, and a tested recovery runbook before mainnet. |
| Admin parameter governance | Needs work | No timelock and insufficient setter validation/caps. |
| Upgradeability | Pass | No proxy/delegatecall upgrade path found in reviewed launch contracts. |
| Market-data authenticity | Fail | Graduation log validation is insufficient (ORB-H03). |

### Invariant and trust-boundary register

| Invariant | Enforcement | Audit result |
|---|---|---|
| Token supply never exceeds initial mint | MemeToken has no external mint | Supported by code/tests |
| Curve reserve/accounting matches transfers | Contract state + SafeUSDC | On-chain path strong; off-chain mirror drifts (ORB-M02) |
| One chain event changes aggregates once | Trade uniqueness | Not enforced for side effects (ORB-M01) |
| Only canonical curves can graduate tokens | Assumed by indexer | Violated by topic-only fallback (ORB-H03) |
| Agent spend never exceeds policy | API pre-check | Violated under concurrency/Sybil creation (ORB-H01/H02) |
| Only verified value transfer counts as a tip | Optional receipt verification | Violated (ORB-M04) |
| Graduation permanently removes creator control | Migration/renounce/burn | Supported by code/tests |

### External call inventory

| Component | External call | Main control / concern |
|---|---|---|
| TokenFactory | USDC `transferFrom`; deploy token/curve | SafeUSDC; owner configuration remains privileged |
| BondingCurve | USDC/token transfers; migrator call | ReentrancyGuard, slippage, checks-effects-interactions |
| LiquidityMigration | token/USDC transfers; AMMFactory/pair calls | `onlyFactory`; entire-balance accounting issue |
| AMMPair | token transfers | ReentrancyGuard and constant-product check |
| AMMRouter | arbitrary pair/token calls | Missing canonical-pair validation |
| API deployer | Arc RPC and signed transactions | Shared hot wallet, non-atomic policy checks |
| Indexer/RPC proxy | Third-party Arc RPC | Untrusted logs, quota/range controls, embedded key |
| API storage | PostgreSQL/Redis TLS | Certificate verification disabled |
| Frontend | Wallet provider and API | Unlimited approvals, localStorage auth token |

### Positive controls observed

- Reentrancy guards on state-changing curve and AMM swap paths.
- SafeUSDC low-level wrapper accounts for Arc's non-standard `transferFrom` behavior.
- No `tx.origin`, `delegatecall`, `selfdestruct`, public mint, or unchecked low-level value call was found in launch contracts.
- Compiler version is pinned; contract tests include graduation and AMM invariants.
- API uses Helmet, CORS allowlisting, validation pipes, and throttling.
- Render blueprint disables insecure authentication and autonomous agent execution.
- A live unauthorized favorites request returned HTTP 401, confirming insecure wallet-header fallback was off.
- All 19 observed public database tables had row security enabled at review time.
- Live frontend supplied HSTS, frame denial, MIME sniffing protection, CSP, and a restrictive permissions policy.
- `.env` files were ignored and no committed wallet private key was identified.

## 6. Recommendations Roadmap

### Immediate — before more public testing with funded agents

1. Disable self-service funded agents and cap/minimize the deployer balance.
2. Implement atomic spend reservations and idempotency for agent transactions.
3. Restrict graduation indexing to verified canonical emitters.
4. Make trade/indexer processing idempotent and remove double-counting.
5. Require and verify tip transactions.
6. Rotate the embedded RPC key and remove it from source.

### Before mainnet

1. Reproduce the verified multisig ownership model for mainnet with hardware-backed signers; add timelocked/capped admin changes and an emergency recovery runbook.
2. Resolve/triage production dependency advisories and align the Nest dependency major.
3. Correct buy/sell event accounting and add chain-to-database invariant tests.
4. Adopt strict SIWE verification with Redis-backed one-time nonces.
5. Enable TLS certificate verification and least-privilege database roles.
6. Bound public RPC work and harden wallet approvals.
7. Fix and independently review AMMRouter before deployment.
8. Commission an independent contract and application audit, then retest all findings.

### Post-launch defense in depth

1. Add continuous dependency, secret, SAST, contract-format, and migration-policy checks to CI.
2. Alert on deployer spend velocity, admin transactions, pause/config changes, event/indexer divergence, RPC quota use, and repeated auth failures.
3. Reconcile indexed reserves/fees/volume to on-chain values continuously.
4. Publish verified contract addresses, privileged roles, fee controls, and graduation guarantees for users.

## 7. Appendix

### Verification performed

- `forge test --root contracts`: **33/33 passed**.
- API Jest suite: **23/23 passed**.
- Web Jest suite: **101/101 passed**.
- API production build: **passed**.
- Web production build: **passed** with non-blocking third-party dynamic-dependency/edge-runtime warnings.
- `npm audit --omit=dev`: **8 high, 30 moderate, 0 critical** production-tree advisories.
- `git diff --check`: **passed**.
- `forge fmt --check`: **failed on existing formatting differences**; no runtime/security failure inferred.
- Slither: **not installed; not run**.
- Arc testnet read-only calls: TokenFactory unpaused, creation fee 5 USDC, expected treasury/migrator configured, and the same EOA owns TokenFactory, Treasury, AMMFactory, and LiquidityMigration.
- Live read-only checks: security headers inspected, insecure wallet-only auth rejected, and database RLS state inspected.

### Severity counts

| Critical | High | Medium | Low | Informational |
|---:|---:|---:|---:|---:|
| 0 | 5 | 8 | 5 | Positive controls and test limitations documented |

### Final assessment

The bonding-curve and graduation design is promising and contains meaningful anti-rug protections, but Orba's launch readiness is currently constrained by backend trust validation, funded-agent abuse paths, operational key custody, dependency exposure, and off-chain accounting correctness. Close the High findings first, then the Medium findings that affect authentication and financial state, before treating the system as production-ready.
