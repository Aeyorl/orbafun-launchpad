# Arc testnet manual-QA evidence review — 2026-08-28

This record reconciles the fully checked `STRESS_TEST_CHECKLIST.md` found in
the local `codex/frontend-ui-refresh` working tree. It is testnet-only evidence.
It is not an independent security audit, auditor fix review, mainnet approval,
or proof of a mainnet deployment.

## Reviewed material

- WIP branch HEAD: `d286dc023e04e414b1694ff0e68e683860ac8cad`.
- Checked WIP checklist SHA-256:
  `9E33BFECB82D7532E5AF5E67A1D737E46416E762CC72B9ECDDA6E16857E5B7BA`.
- Recovery patch SHA-256:
  `3C34FAF12BB864D7F0A4CF21E836E0FB2ACDABC72ECA127728820C07176A0553`.
- Historical mechanics report `orba-mechanics-readiness-2026-08-08.md`,
  SHA-256:
  `F497699D0D13DDCCA7444001F8C888C5FCAB2916D3A0982FF3F103B31FCDF625`.
- Archived design screenshots, local API/web logs, and the repository's
  existing audit-candidate documentation.

## Verification result

The checked WIP checklist cannot be accepted as a completed manual test run:

- Every row was checked, but the date/initial field on every row was blank.
- The sign-off used the generic label `Manual QA` for both testers rather than
  identifying two operators.
- No per-row screenshot, transaction hash, receipt, console/network capture,
  or findings-log reference was linked.
- The available mechanics report is dated 2026-08-08. It supports historical
  automated contract, deployment, and load-test claims, but it does not prove
  the browser and wallet interactions claimed for 2026-08-27 or validate the
  current `origin/master` revision.
- The archived design screenshots demonstrate selected layouts, not the full
  wallet, transaction, real-time, failure, cross-browser, or mobile checklist.

Accordingly, **zero manual checklist rows were carried forward as passed**.
The canonical checklist remains unchecked until each row has traceable evidence
and an identifiable tester/date.

## Corrected test expectations

- Production bonding curves graduate at **$30,000 market cap**, as defined by
  `BondingCurve.GRADUATION_MARKET_CAP`.
- The Orba AMM uses the constant-product output formula with a **0% AMM fee**.
- Arc testnet results must not be presented as mainnet deployment evidence.

## Release disposition

Mainnet remains **NO-GO pending an independent external audit and fix review**.
The immutable candidate remains the commit resolved by
`orba-mainnet-audit-rc1`; this post-candidate documentation does not alter or
expand that audit candidate.
