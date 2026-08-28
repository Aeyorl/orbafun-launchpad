# Supabase restore drill evidence — 2026-08-28

## Status and scope

- Technical restore result: **PASS**
- Independent second-operator review: **PASS**
- Environment: disposable Supabase project in `eu-west-1` (West EU, Ireland)
- Evidence type: production-data recovery drill; this is not an external audit,
  a mainnet approval, or authorization to deploy.
- Primary operator: Aeyod7 account owner, assisted by Codex.

The disposable project was retained until a second operator verified this
record, then deleted after separate action-time confirmation.

## Target isolation

| Item | Value |
| --- | --- |
| Production project ref | `xzizgsnvmupzpaoxhvxs` |
| Isolated restore project | `orba-restore-drill-20260828` |
| Isolated project ref | `ipraxymzopthigmxvryw` |
| Region | `eu-west-1` |
| Database | PostgreSQL 17.6 |
| Connection | Supabase IPv4 session pooler, TLS certificate verification enabled |

The restore command contained an explicit guard that refused execution if the
restore ref matched the production ref. Production was not modified.

## Source backup and integrity

- GitHub Actions run: [Encrypted Supabase backup 33179554867](https://github.com/Aeyod7/orbafun-launchpad/actions/runs/33179554867)
- Artifact: `orba-supabase-backup-33179554867`
- Backup archive timestamp: `2026-08-28T14:20:48Z`
- Encrypted archive SHA-256:
  `446304891fe9be8b99bd0de984236c961608869a393a425fbe129bfc58b6440c`
- Recovery-key fingerprint:
  `8E64028595F233A62435975F2D69FFA65D9ABD72`
- The detached encrypted-file checksum passed before decryption.
- All nine payload entries passed the signed archive's `SHA256SUMS` manifest.

The managed Auth and Storage manifests contained zero users, zero buckets, and
zero objects. Their dumps were integrity-checked but were not applied over the
fresh project's provider-managed schemas. The application-owned `public` schema
was restored.

## Timing

| Event | UTC |
| --- | --- |
| Disposable project created | `2026-08-28T22:19:48Z` |
| Encrypted artifact downloaded | `2026-08-28T22:29:23Z` |
| Final clean database restore started | `2026-08-28T22:37:02Z` |
| Final clean database restore completed | `2026-08-28T22:40:09Z` |
| Application smoke completed | `2026-08-28T22:50:44Z` |

- Database restore duration: **3 minutes 7 seconds**.
- End-to-end recovery exercise duration, project creation through application
  smoke: **30 minutes 56 seconds**.
- Observed RPO at final restore start: **8 hours 16 minutes 14 seconds**, based
  on the age of the selected backup archive.

These are observed drill values, not contractual RTO/RPO guarantees.

## Database validation

The restored database matched the encrypted backup manifests exactly:

| Check | Result |
| --- | --- |
| Application tables | 24 |
| Columns | 256 |
| Constraints | 85 |
| Indexes | 84 |
| RLS policies | 24 |
| Sequences | 15 |
| Functions | 1 |
| Triggers | 0 |
| Per-table row counts | Exact match for all 24 tables |

Representative restored counts include 29 tokens, 539 trades, 471 price
snapshots, 243 users, 281 wallet positions, eight agents, and three metadata
rows.

The canonical database migration was then applied to the isolated target to
provision `orbafun_runtime`. The role connected through TLS and was verified as:

- login enabled;
- not a superuser;
- no `BYPASSRLS`;
- no create-database, create-role, or replication privilege;
- covered by all 24 `orbafun_runtime_access` RLS policies.

The row-count and structural comparisons passed again after the migration.

## Application smoke

The production API build was started locally against the isolated database with
the Arc poller, Envio poller, agent executor, monitoring, deployer signer, and
funded actions disabled. The API connected as the restored least-privilege
runtime role using the pinned Supabase CA.

Read-only checks passed:

- `GET /health` returned `status: ok`.
- `GET /tokens?status=all&limit=5` returned five records and reported 12
  factory-scoped visible tokens.
- `GET /tokens/stats` reported the same 12 visible tokens: 11 active and one
  graduated.
- The selected token-detail response matched the requested contract address.
- The selected token-metadata endpoint returned its persisted metadata shape.
- `GET /tokens/activity/recent?limit=10` returned ten restored activities.
- `GET /agents?limit=5` returned five agents and reported eight total.

Redis was deliberately pointed at an unavailable local port during this
database-only smoke. The API's documented degraded mode activated, so
`/health/ready` was not used as evidence for the separate production Redis gate.
No blockchain transaction, funded test, deployment, or write API was executed.

## Drill observations

Two safe setup issues were found before the final clean run:

1. A new Supabase project already contains an empty `public` schema. The first
   attempt stopped on that conflict before loading application data. The final
   procedure drops the isolated target's `public` schema and lets the verified
   dump recreate it.
2. The RLS policies reference `orbafun_runtime`, which does not exist in a new
   project. The role must be created before restore; the canonical migration
   then provisions its login, grants, and least-privilege attributes.

The final restore was rerun from a clean `public` schema after both prerequisites
were understood, and all comparisons passed.

## Second-operator acceptance

- Reviewer: Shalen
- Review timestamp: `2026-08-28T23:00:06Z`
- Confirmed source artifact and checksum: **PASS**
- Confirmed production and restore refs differ: **PASS**
- Confirmed row-count/structure comparisons: **PASS**
- Confirmed application smoke evidence: **PASS**
- Approved deletion of isolated project: **YES**

> I independently reviewed the Supabase restore-drill evidence and confirm that
> the isolated restore completed successfully without modifying production.

- Signed: Shalen
- Role: Tester / technical reviewer
- Date: `2026-08-28`

The independent review closes the formal human-verification requirement for
this restore drill.

## Isolated-project retirement

- Action-time deletion confirmation received: **YES**
- Deleted project: `orba-restore-drill-20260828`
- Deleted project ref: `ipraxymzopthigmxvryw`
- Deletion timestamp: `2026-08-28T23:11:45Z`
- Post-deletion dashboard verification: **PASS**
- Production project still present: `Aeyod7's Project`
- Production project modified by deletion: **NO**

After deletion, Supabase returned to the organization project list and showed
only the production project. The encrypted recovery artifact and drill evidence
remain outside the deleted project.
