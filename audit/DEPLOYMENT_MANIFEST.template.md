# Orba mainnet deployment manifest template

Do not populate or approve this document until Arc mainnet is officially
documented, the external audit and fix review are closed, and deployment is
separately authorized. Testnet values are forbidden.

## Release identity

- Audited candidate tag: `<tag>`
- Audited candidate commit: `<40-character commit>`
- Remediation/fix-review tag: `<tag>`
- Remediation commit: `<40-character commit>`
- External report URL and hash: `<url>` / `<sha256>`
- Source manifest aggregate: `<sha256>`
- Solidity / optimizer / EVM / Foundry: `<values>`

## Official network evidence

- Network name: `<official value>`
- Chain ID: `<official value>`
- RPC sources (at least two independent providers): `<redacted endpoints/provider evidence>`
- Explorer: `<official URL>`
- ERC-20 USDC address/code hash/decimals: `<values>`
- Native USDC behavior and EVM-difference references: `<official URLs>`
- Parameter approval reviewers/date/evidence: `<two names, UTC date, evidence>`

## Deployment ceremony

- UTC date and block: `<values>`
- Authorized change ticket: `<reference>`
- Hardware-backed deployer address: `<address>`
- Admin Safe address, owners and threshold: `<redacted owner evidence; address; 2-of-3>`
- Timelock delay: `<seconds>`
- Independent verifier: `<name>`

Runtime hashes are Keccak-256. Constructor/immutable-normalized hashes must also
be recorded where raw runtime hashes differ by deployment arguments.

| Contract | Address | Creation transaction | Constructor arguments | Raw runtime hash | Normalized hash |
|---|---|---|---|---|---|
| ProtocolTimelock | `<address>` | `<tx>` | `<args>` | `<hash>` | `<hash/n-a>` |
| Treasury | `<address>` | `<tx>` | `<args>` | `<hash>` | `<hash/n-a>` |
| AMMFactory | `<address>` | `<tx>` | `<args>` | `<hash>` | `<hash/n-a>` |
| AMMRouter | `<address>` | `<tx>` | `<args>` | `<hash>` | `<hash>` |
| TokenFactory | `<address>` | `<tx>` | `<args>` | `<hash>` | `<hash/n-a>` |
| LiquidityMigration | `<address>` | `<tx>` | `<args>` | `<hash>` | `<hash>` |

## On-chain state verification

- Treasury, TokenFactory, AMMFactory and LiquidityMigration owner is timelock.
- TokenFactory guardian is the approved Safe; factory is initially paused.
- Timelock admin is the approved Safe and delay matches approval.
- Factory Treasury, migrator, fee and fee cap match audited constants/config.
- Migrator factory and AMMFactory links match this manifest.
- AMMRouter factory matches this manifest.
- Safe threshold/owners/modules/guards/fallback handler match approval.
- Deployment account has no residual privilege and only approved residual funds.

Attach exact read commands and outputs without secrets.

## Production and canary evidence

- `npm run mainnet:check`: `<pass evidence>`
- Database restore drill and least-privilege role: `<evidence>`
- RPC divergence/failover and monitoring alerts: `<evidence>`
- Indexer replay/head reconciliation: `<evidence>`
- Launch/buy/sell/graduation/router canary: `<transactions and API checks>`
- Web/API/WS smoke tests and production deployment IDs: `<evidence>`
- Rollback owner, trigger and tested procedure: `<evidence>`

## Approval

- External auditor fix-review acceptance: `<name/date/reference>`
- Contract/deployment reviewer: `<name/date>`
- Application/operations reviewer: `<name/date>`
- Legal/release owner: `<name/date>`

Any blank field blocks production cutover.
