# Production infrastructure verification — 2026-08-30

This record covers the production-like Arc testnet stack. It is not an external
audit, mainnet approval, or authorization to deploy contracts. No secret value
was read into or stored in this document.

## Result

| Area | Result | Evidence |
| --- | --- | --- |
| Render API health | PASS | Service `orbafun-api` (`srv-d9mgscm417fc73bd2hv0`) is active on the Starter plan in Oregon. Render health checks use `/health/ready`; `GET /health/ready` returned HTTP 200 with PostgreSQL, Redis and RPC all `true`, and `GET /health` returned HTTP 200 with `status: ok`. |
| Render deployment controls | PASS WITH LIMITATION | The Blueprint-managed service deploys `master` on commit, runs the database migration as its pre-deploy command, and sends failure notifications. This remains dependent on the repository's compensating two-person procedure because Render deploys after merge. |
| Runtime environment coverage | PASS | Authenticated key-name-only inspection confirmed the least-privilege runtime role, pinned PostgreSQL CA, Redis URL, KMS signer fields, disabled funded actions, monitoring switch, RPC thresholds, indexer-lag threshold and backup-drill timestamp. Values were not displayed. |
| Supabase recovery drill | PASS | The independently reviewed [restore drill](SUPABASE_RESTORE_DRILL_2026-08-28.md) restored and smoke-tested the application schema through TLS using `orbafun_runtime`, verified all 24 RLS policies, and retired the isolated project. |
| Supabase managed backups/PITR | OPEN — PLAN UPGRADE | An authenticated dashboard check confirmed project `xzizgsnvmupzpaoxhvxs` is healthy on `eu-west-1` / `t3.nano`, but its current Free Plan reports **Last backup: No backups** and explicitly states that project backups are not included. The encrypted off-site backup workflow and completed restore drill are compensating testnet controls; they are not Supabase-managed scheduled backups or PITR. |
| Upstash transport and access | PASS WITH LIMITATION | Dedicated database `Orba.fun` (`66df37da-3be4-44e0-84e7-02ae6082fc89`) uses TLS, Pay as You Go, a $20 monthly budget, enabled eviction and an account with MFA. The default Redis user is disabled; the live API readiness check proves its configured credential can reach Redis. The exact custom ACL permission set was not re-read because the console disables its ACL view while the default user is off. |
| Upstash cost protection | PASS | Current console cost was $0.01 against the $20 hard budget. Upstash documents email notices at 70% and 90% and rate limiting at the cap. |
| Upstash backup | OPEN — PRICE APPROVAL | Daily backup is off. Enabling it would keep the latest daily backup and costs $0.25 per GB-month. The confirmation was cancelled without changing billing. The paid $200/month Prod Pack was not activated. |
| External uptime monitoring | PASS | Better Stack monitor `4873875` checks `https://orbafun-api.onrender.com/health/ready`; monitor `4873876` checks `https://www.orba.fun/`. Both are on the free 3-minute schedule from Europe, North America, Asia and Australia with email notification enabled. |
| RPC health | PASS FOR TESTNET | The live readiness response reported RPC healthy; the Render configuration contains independent-provider count, divergence and indexer-lag thresholds. Final mainnet RPC evidence cannot exist until Circle publishes Arc mainnet parameters and at least two independent mainnet providers are provisioned. |

## Applied changes

- Created Better Stack monitor `4873875`, **Orba API readiness**.
- Created Better Stack monitor `4873876`, **Orba web production**.
- Retained four-region checking, TLS verification, IPv4/IPv6, three-minute
  frequency and email notification on the free plan.
- Did not enable a billed Upstash feature without explicit price approval.
- Reauthenticated to Supabase and verified the production-like project is
  healthy. Confirmed that the current Free Plan has no managed scheduled backup
  and therefore cannot satisfy the runbook's managed backup/PITR requirement.

## Gate disposition

The free production-like infrastructure work is **cleared** for the current Arc
testnet deployment: live API dependencies are ready and independent external
web/API monitoring is configured. The following are intentionally still open:

1. Upstash daily backup requires explicit approval of its storage charge;
2. Supabase must move to a plan/configuration with managed scheduled backups
   and the required PITR retention before the mainnet database gate can close;
3. Arc mainnet parameters plus two independent paid mainnet RPC providers remain
   mandatory before the mainnet infrastructure gate can close.

Mainnet remains **NO-GO pending external audit and every mainnet-only gate**.
