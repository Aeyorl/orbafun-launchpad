# Audit candidate verification — 2026-08-25

This is internal preparation evidence, not an independent audit or mainnet
approval. The final candidate identity is the annotated
`orba-mainnet-audit-rc1` tag.

## Completed checks

| Check | Result |
|---|---|
| Official Arc status | Circle documentation says Arc is testnet-only |
| Fresh dependency install | 1,504 packages installed; npm reported 0 vulnerabilities |
| Production dependency audit | 0 vulnerabilities at `high` threshold |
| Solidity compiler/build | Solidity 0.8.26; success; no build/lint warnings |
| Contract size check | All production contracts below EVM runtime/initcode limits |
| Foundry tests | 48 passed, 0 failed, 0 skipped |
| Web tests | 145 passed |
| TradingView preparation tests | 4 passed |
| API tests | 116 passed |
| Workspace lint/type checks | Passed for web, API and shared package |
| Production application build | Web, API and shared builds passed using documented public example values |
| Mainnet fail-closed drill | Correctly failed against `.env.example`, including testnet chain and unapproved-parameter gates |
| Dependency provenance | Vendored forge-std and Solady `src/` trees matched recorded commits |
| Diff hygiene | `git diff --check` passed |

The local web build used the documented Lightweight Charts fallback because no
licensed TradingView checkout was configured. The message was informational and
the build completed. CI/prod remains configured to require verified Advanced
Charts assets when that mode is enabled.

## Coverage limitations

- Slither, Semgrep, Mythril, Gitleaks and TruffleHog were not installed. Simple
  tracked-file pattern checks found no AWS access keys, GitHub tokens or PEM
  private-key blocks; assignment-pattern matches were documented examples and
  shell/environment placeholders. This is not a replacement for auditor tooling.
- Arc fork tests produced one transient Foundry cache-miss notice before using
  the configured RPC; all ten Arc integration tests passed.
- No mainnet E2E, bytecode comparison, canary, Safe verification or production
  smoke test is possible while Arc remains officially testnet-only.
- No formal verification or independent human audit was performed in this pass.

## Freeze rule

After the tag is shared with an auditor, do not amend, move or recreate it. Any
change to a file listed in `ARTIFACTS.sha256` requires a new candidate tag and a
review-delta decision. Deployment remains blocked by `KNOWN_LIMITATIONS.md` and
`docs/MAINNET_RUNBOOK.md`.
