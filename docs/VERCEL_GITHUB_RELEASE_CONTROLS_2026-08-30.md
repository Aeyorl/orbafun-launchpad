# Vercel and GitHub release-control verification — 2026-08-30

This is internal production-infrastructure evidence. It is not an external
audit, mainnet approval, or authorization to deploy contracts.

## Scope

- Vercel team: `aeyomides-projects` (`Hobby` plan)
- Vercel project: `orbafun-launchpad-web`
- GitHub repository: `Aeyod7/orbafun-launchpad`
- GitHub default/production branch: `master`
- Verification method: authenticated Vercel inspection and configuration,
  authenticated GitHub API queries, and local Git signing verification

No environment-variable value was stored in the repository or this evidence
record. The Preview credential was transmitted to Vercel through standard input.
No repository visibility, production-domain mapping or Production credential was
changed.

## Result

| Control | Result | Evidence |
|---|---|---|
| Production/preview API and WebSocket variables use separate entries | PASS | `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_WS_URL` each have distinct Production and Preview entries. Contract-address variables also have environment-scoped entries. |
| Enforced distinct production secret values | PASS | `TRADINGVIEW_GITHUB_TOKEN` now has separate encrypted Production and Preview entries. Team policy **Separate Production Secret Values** is enabled and remained checked after reload. |
| Sensitive environment-variable enforcement | FAIL | Team policy **Enforce Sensitive Environment Variables** is disabled. |
| Preview deployment access protection | PASS | Vercel Authentication / **Require Log In** is enabled. Password protection and trusted-IP protection are unavailable on the current plan. |
| Protected source maps | PASS | Vercel reports Protected Sourcemaps as enabled. |
| Production branch mapping | PASS | Vercel Production tracks `master`; Preview tracks all unassigned Git branches. |
| Manual production deployment approval | FAIL | Vercel states that every commit pushed to `master` creates a Production Deployment, and auto-assignment of production domains is enabled. No approval stage is configured or exposed on the current project settings. |
| GitHub `master` branch protection | FAIL | GitHub reports `protected: false` and status-check enforcement `off`. Branch-protection and ruleset APIs return that GitHub Pro is required for this private repository, or the repository must be public. |
| Verified-commit enforcement | PASS | An existing Windows Ed25519 public key was registered with GitHub as a signing key; repository-local Git configuration now signs new commits; Vercel team policy **Require Verified Commits** was enabled and saved. The previously deployed `43a4133` remains historically unsigned. |
| Team 2FA enforcement | FAIL | Vercel team Two-Factor Authentication Enforcement is disabled. |

## Gate disposition

The Vercel/GitHub production-control gate is **partially closed but remains
open**. Environment-specific public runtime configuration, preview
authentication and verified-commit enforcement are present. The current
configuration still does not prevent an authorized signer from pushing an
unreviewed commit directly to `master`, which would reach the production
domains without a deployment approval.

## Changes applied

- Registered the existing Windows Ed25519 public key as a GitHub **signing**
  key. The private key was not displayed, copied or uploaded.
- Enabled repository-local SSH commit signing with `commit.gpgsign=true`.
- Enabled and saved Vercel team **Require Verified Commits** enforcement.
- Pushed signed commit `d2c8e0f402f6dfafbfb121fbde8ed31a62f48af5`;
  GitHub reported `verified=true` with reason `valid`. Release gate run
  `33310171555` passed, Vercel production deployment
  `dpl_KkFwDUbY4grVWFxewygUqbnZ8xXR` reached **Ready**, and
  `https://www.orba.fun/` returned HTTP 200.
- Restricted the existing `TRADINGVIEW_GITHUB_TOKEN` entry to Production and
  added a separate encrypted Preview entry. GitHub offered only `Aeyod7` as a
  fine-grained-token resource owner, so the private TradingView organization
  was not eligible for a repository-scoped fine-grained token. With explicit
  operator approval, a 30-day classic `repo` token was used for Preview and is
  scheduled for rotation by `2026-09-29`.
- Enabled and saved Vercel team **Separate Production Secret Values**
  enforcement.
- Redeployed Preview commit `d3ecf36` as
  `dpl_4h4VpSF9GVMDMSk6F2TgGqqTgUPm`. The deployment reached **Ready** and its
  build log confirms that TradingView Advanced Charts assets were fetched and
  verified at `470eec1bba4ada14e0f0b12dd17ca56ae81f36ff` before the Next.js build
  completed.
- Opened pull request `#10` for the compensating two-person release procedure.
  All Release gate and Vercel checks pass; the pull request remains unmerged
  pending approval from a second human who did not author the change.

## Remediation choices

1. Rotate the temporary Preview TradingView credential by `2026-09-29`, retain
   separate Production and Preview values, and keep both credentials out of the
   repository and evidence documents.
2. Enable sensitive-variable and team-2FA enforcement where the current Vercel
   plan permits them and after confirming every human and CI account is ready.
3. Upgrade GitHub or make the repository public before claiming enforced branch
   protection. Making the repository public is not recommended solely to obtain
   this feature because the repository may contain private operational history.
4. Until an enforceable approval feature is available, treat direct pushes to
   `master` as prohibited by procedure: review a pull request, require passing
   release checks and a second human approval, then merge. This is a compensating
   process control, not equivalent to platform enforcement.
5. For mainnet, use a plan/configuration that can enforce branch protection and
   production deployment approval. Re-run this verification after configuration
   changes and attach the resulting evidence to the release manifest.

Mainnet remains **NO-GO pending external audit and all runbook gates**.
