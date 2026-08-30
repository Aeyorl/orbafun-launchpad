# Orba mainnet launch runbook

Mainnet launch is blocked until every gate below is evidenced. Arc testnet and
mainnet are separate environments; never reuse testnet contract addresses,
databases, Redis databases, signing keys or API secrets.

## Release gates

As checked on 2026-08-25, Circle's official documentation says Arc is available
on testnet only. This runbook cannot be executed until that status changes.

1. Circle publishes final Arc mainnet RPC, explorer, chain and USDC parameters;
   two reviewers record the official sources and set
   `ARC_MAINNET_PARAMETERS_APPROVED=true` only after matching them independently.
2. Contract source is frozen and the external audit plus remediation review are
   complete against the exact release commit.
3. All contract, API, web, E2E, graduation and load tests pass from that commit.
4. A fresh staging deployment is exercised end to end for at least seven days.
5. The admin Safe has three hardware-backed owners, threshold two, verified
   recovery procedures and no shared seed phrases. The
   [Arc Testnet Safe recovery drill](SAFE_RECOVERY_DRILL_2026-08-30.md)
   validates the procedure and owner participation only; repeat and approve
   these checks against the final production Safe before mainnet launch.
6. The Safe controls `ProtocolTimelock`; the timelock owns Treasury, Factory,
   AMMFactory and LiquidityMigration. The Safe is only the factory pause guardian.
7. `npm run mainnet:check` passes against the proposed production environment.
8. A mainnet-only deployment script with explicit chain and USDC code guards is
   reviewed against the final official parameters; testnet scripts are not reused.

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

## Compensating production-release control

Until the private repository has enforceable branch protection and Vercel has
production deployment approvals, direct pushes to `master` are prohibited by
procedure. The [2026-08-30 release-control rehearsal](VERCEL_GITHUB_RELEASE_CONTROLS_2026-08-30.md)
clears this compensating process for production-like testnet releases. It does
not close the mainnet infrastructure gate or become platform enforcement.

Every production release must:

1. use a pull request from a non-production branch;
2. identify the exact commit and paths entering production;
3. pass the repository Release gate workflow;
4. receive an explicit approval from a second human who did not author the
   change;
5. use a GitHub-verified signed merge commit; and
6. record the pull request, approved commit, Vercel deployment and production
   smoke result in the release evidence.

The author must not count as the second approver. Emergency changes follow the
same review requirement; if the platform cannot enforce it, the release remains
procedurally controlled and must not be represented as independently enforced.

## Production infrastructure

The [2026-08-30 production-infrastructure evidence](PRODUCTION_INFRASTRUCTURE_EVIDENCE_2026-08-30.md)
records the controls that are currently live, the free monitoring checks added,
and the provider/user-action items that remain open. It is production-like
testnet evidence, not a substitute for final mainnet-provider verification.

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
