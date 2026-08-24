# Frontend UI Refresh WIP Reconciliation — 2026-08-25

## Protected source

- Checkout: `C:\Project folder\arc launchpad`
- Branch: `codex/frontend-ui-refresh`
- Recorded HEAD: `d286dc023e04e414b1694ff0e68e683860ac8cad`
- Reconciliation base: `origin/master` at `6bb983aed1d2e4b347f9e4a1cf78d41b12d215e1`

The protected checkout was not rebased, reset, merged, cleaned, or bulk-staged.

## Transplanted work

- `007061d` normalizes X/Twitter handles and profile URLs in the metadata API,
  rejects off-domain or non-profile URLs, and adds focused service tests.
- `a61bd98` validates launch metadata before signing, preserves description-only
  metadata, canonicalizes X/Twitter input, and retries indexed metadata writes.

## Reviewed but not transplanted

- AMM swap indexing, checkpoint failure handling, continuous post-graduation
  volume, automatic graduation, AMM router tests, WalletConnect, IPFS gateway
  retries, and image preview recovery are already present on `master` with later
  tests or hardening.
- Local versions of `TradePanel`, indexer, deployment, readiness, and graduation
  scripts predate newer production changes and would regress current behavior if
  applied wholesale.
- Cosmetic launch-page, homepage, navbar, and trading experiments were not mixed
  into the behavioral recovery commits.
- No contract or release-tooling commit was required because the valid contract
  changes were byte-for-byte present on `master`, while current release tooling
  supersedes the older checkout.

## Intentionally excluded

Generated screenshots, `output/`, `tmp/`, PDFs, licensed TradingView runtime
assets, installed agent skills, caches, environment files, and secrets remain
outside product commits. The protected checkout should remain available until
these reconciliation commits are reviewed and explicitly accepted.
