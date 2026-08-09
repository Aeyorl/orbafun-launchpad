# Orba audit handoff

This directory is the external-audit entry point.

- `SCOPE.md` pins the requested contract and operational scope.
- `INVARIANTS.md` states the properties auditors should try to break.
- `RFP.md` is the proposal request and candidate list.
- `DEPLOYMENT_MANIFEST.template.md` records the audited release and deployed
  runtime code hashes.

Before sending the package, freeze one commit, run all verification commands,
replace every placeholder in the deployment manifest and make the repository
available read-only to the selected reviewers. No mainnet deployment should
occur before the final fix review and bytecode verification are complete.
