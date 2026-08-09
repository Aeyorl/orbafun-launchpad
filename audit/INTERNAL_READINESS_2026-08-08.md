# Internal mainnet-readiness review — 2026-08-08

## Result

This is pre-audit hardening, not an external security certification and not a
mainnet approval. Arc mainnet deployment remains blocked.

## Implemented

- Added a 24-hour-minimum/30-day-maximum protocol timelock; deployment defaults
  to 48 hours.
- Changed privileged contract ownership from the Safe directly to the timelock.
- Limited the Safe's immediate authority to pausing new launches; it cannot
  unpause or reconfigure through the guardian path.
- Added the previously tested AMMRouter to the canonical deployment script.
- Made platform-funded agent actions opt-in and fail closed without per-action,
  hot-wallet balance, platform daily and platform monthly caps.
- Prohibited raw environment private-key signing on Arc mainnet.
- Released failed on-chain spend reservations so failures do not permanently
  consume agent limits.
- Added database/Redis/RPC readiness health checks and production CORS cleanup.
- Added a strict mainnet configuration/bytecode/audit/backup validation script.
- Updated patched transitive dependencies; npm reports zero known vulnerabilities.

## Verification evidence

- Foundry: 47/47 tests pass, including seven timelock/guardian tests.
- NestJS API: production build passes; 27/27 tests pass.
- Next.js production webpack build passes with production API/WS variables.
- `npm audit --package-lock-only`: zero known vulnerabilities.
- Arc testnet deployment simulation succeeds and estimates 12,022,470 gas,
  approximately 0.499 USDC at the sampled gas price.

## Open blockers

1. External contract audit, remediation review and deployment verification.
2. Circle's final authoritative Arc mainnet RPC/explorer/USDC parameters.
3. Production Supabase backup/restore drill and PostgreSQL-version evidence.
   PostgreSQL 17 client tools are installed, but the project CA must be obtained
   from the authenticated dashboard before strict `verify-full` validation.
4. Authenticate the Upstash Developer API and set the account-owner-approved
   budget so native 70%/90% capacity emails complement the in-app Redis checks.
5. Provision the implemented AWS KMS secp256k1 signer, pin its expected address,
   and independently review its IAM policy and spending ceilings before
   platform-funded agents can ever be enabled on mainnet.
