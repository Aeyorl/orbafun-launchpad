# Orba mainnet launch runbook

Mainnet launch is blocked until every gate below is evidenced. Arc testnet and
mainnet are separate environments; never reuse testnet contract addresses,
databases, Redis databases, signing keys or API secrets.

## Release gates

1. Circle publishes final Arc mainnet RPC, explorer, chain and USDC parameters.
2. Contract source is frozen and the external audit plus remediation review are
   complete against the exact release commit.
3. All contract, API, web, E2E, graduation and load tests pass from that commit.
4. A fresh staging deployment is exercised end to end for at least seven days.
5. The admin Safe has three hardware-backed owners, threshold two, verified
   recovery procedures and no shared seed phrases.
6. The Safe controls `ProtocolTimelock`; the timelock owns Treasury, Factory,
   AMMFactory and LiquidityMigration. The Safe is only the factory pause guardian.
7. `npm run mainnet:check` passes against the proposed production environment.

## Deployment ceremony

- Tag and sign the audited release commit. Record solc 0.8.26, optimizer runs
  200, Foundry version and dependency commits.
- Use a dedicated, hardware-backed deployment account with only the USDC needed
  for deployment. Never enter its private key into Render, Vercel or CI.
- Deploy from an offline-reviewed script execution. Two people compare every
  address and constructor argument before broadcast.
- Verify source on the official explorer. Record creation transaction hashes,
  runtime-code hashes, owners, guardian, timelock delay, fee and migrator.
- Transfer any deployment-account remainder to the Safe treasury.
- Do not update public DNS/config until an independent person reproduces the
  manifest checks and the E2E smoke test passes.

## Production infrastructure

- Render API: production-only CORS, `AUTH_ALLOW_INSECURE=false`, strict proxy
  count, least-privilege runtime DB role, deploy migrations with the owner role,
  and health alerts from two regions.
- Supabase: PostgreSQL 17+, TLS verify-full, PITR/backups enabled, restore drill
  completed into an isolated project, runtime grants/RLS verified, migration
  credentials absent from runtime.
- Upstash: dedicated production Redis, `rediss://`, ACL-scoped token, eviction
  and memory alerts, documented TTLs, and a tested degraded-mode plan.
- Vercel: production API/WS variables required at build time, preview and
  production secrets separated, branch protection and deployment approvals.
- RPC: at least two paid mainnet providers with independent failure domains;
  rate-limit, latency, wrong-chain and stale-block alerts.
- Observability: API error rate/latency, DB pool saturation, Redis failures,
  indexer lag, RPC divergence, failed receipts, Safe/timelock events, treasury
  flows, pause state and deployer balance.

## Platform-funded agents

They remain disabled on mainnet until review. `DEPLOYER_PRIVATE_KEY` is forbidden
in mainnet runtime. The implemented signer uses an AWS KMS
`ECC_SECG_P256K1`/`SIGN_VERIFY` key, verifies its derived address against
`AWS_KMS_EXPECTED_ADDRESS`, and permits transaction signing only. Re-enable only
after the KMS/IAM policy and per-action, daily, monthly, minimum-balance and
maximum-balance limits are independently reviewed. Excess funds go to the Safe.

## Incident response

1. Pause new launches with the Safe guardian if factory abuse is suspected.
2. Disable API deployer actions and autonomous executors.
3. Preserve logs and publish the affected chain/time/transactions.
4. Do not unpause through the timelock until root cause, remediation, regression
   tests and external review are complete.
5. Treasury or configuration changes follow the timelock even during incidents;
   the guardian has no withdrawal or reconfiguration bypass.

## Backup/restore evidence

Record the date, operator, source backup, isolated restore target, row counts,
application smoke tests, RTO and RPO. Destroy the isolated restore only after a
second operator verifies the evidence. Set `BACKUP_RESTORE_DRILL_AT` to the ISO
timestamp of the latest successful drill.
