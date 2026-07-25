# Licenses

This repository uses a **split license**: the smart contracts are MIT-licensed (fully open
source), and the application layer is Business Source License 1.1 (source-available, converts
to MIT after 4 years).

## Summary

| Component | Paths | License | SPDX Identifier | Change Date | Change License |
|---|---|---|---|---|---|
| Smart contracts | `contracts/` | MIT | `MIT` | — | — |
| Application layer | `apps/`, `packages/`, `scripts/` | Business Source License 1.1 | `BSL-1.1` | 2030-07-25 | MIT |

## Smart contracts — MIT

**File:** [`contracts/LICENSE`](contracts/LICENSE)

Every `.sol` file in `contracts/src/`, `contracts/src/test/`, `contracts/test/`, and
`contracts/test/mocks/` carries the SPDX identifier:

```solidity
// SPDX-License-Identifier: MIT
```

The contracts are the trust layer — bonding curve mechanics, anti-rug graduation (LP burn,
ownership renunciation), AMM, and the atomic swap router. They are fully open source: anyone
may use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies, subject to
the standard MIT terms. Once deployed, the bytecode is public on Arcscan anyway; open-sourcing
the source lets users independently verify the anti-rug guarantees.

## Application layer — Business Source License 1.1

**File:** [`LICENSE`](LICENSE) (repo root)

The application layer covers everything that isn't a smart contract:

- `apps/api/` — NestJS API, indexer, WebSocket gateway
- `apps/web/` — Next.js 15 frontend
- `packages/shared/` — shared TypeScript config and constants
- `scripts/` — operational and test scripts

### What you can do

Under BSL 1.1, you may **copy, modify, create derivative works, redistribute, and make
non-production use** of the Licensed Work. "Non-production use" includes development, testing,
evaluation, and demonstration.

### What you can't do (before the Change Date)

You may **not** use the Licensed Work for production use without written permission from the
Licensor (a commercial license). This is what makes the code "source available" rather than
"open source" — you can read it, study it, run it locally, and propose changes, but you can't
stand up a competing production launchpad using this code without a license.

### The Change Date

On **2030-07-25** (four years after the first public distribution), the app layer automatically
converts to the **MIT License**. At that point, all rights granted by MIT apply — including
unrestricted production and commercial use.

This is the standard BSL 1.1 mechanic used by HashiCorp, Sentry, Couchbase, MariaDB, and
others: keep commercial exclusivity for a defined period, then become fully open source.

### Why this split

A memecoin launchpad is **trivially cloneable** — the product moat is brand, liquidity, and
the agent ecosystem, not the code. MIT-licensing everything would let a competitor fork the
entire codebase and launch `orba-clone.fun` in a weekend. The split license:

1. **Keeps the trust layer open** (contracts = MIT) — users can verify anti-rug mechanics,
   auditors can review freely, and the on-chain behavior is already public anyway.
2. **Protects the product layer** (app = BSL) — the indexer logic, agent API, referral system,
   frontend UX, and operational scripts are the actual product. BSL keeps commercial
   exclusivity for 4 years while still being readable and contributor-friendly.
3. **Has a clean endgame** — everything becomes MIT in 2030. No perpetual lock-in.

## SPDX identifiers in `package.json`

| Package | `license` field |
|---|---|
| `orbafun` (root) | `BSL-1.1` |
| `@orbafun/api` | `BSL-1.1` |
| `@orbafun/web` | `BSL-1.1` |
| `@orbafun/shared` | `BSL-1.1` |

The `contracts/` directory has no `package.json` (it's a Foundry project, not an npm
workspace); its license is declared via the SPDX identifiers in each `.sol` file and the
`contracts/LICENSE` file.

## Copyright holder

The copyright notice in both license files reads `Copyright (c) 2026 Orba`. **Replace this
with your actual legal entity name** (an individual, an LLC, a corporation, or a DAO / legal
wrapper) before any public release. The license is enforceable only if the copyright holder is
a real, identifiable legal entity.

If you incorporate as "Orba Labs Inc." or similar, update:

- `contracts/LICENSE` — the `Copyright (c)` line
- `LICENSE` — the `Licensor:` field in the Parameters section

## Trademark

Neither license grants any right to use the "Orba" name, logo, or brand. The deployed site's
`legal/trademark-guidelines` page governs trademark use separately.

## Disclaimer

This document is a summary for convenience only. The actual license terms are in
[`LICENSE`](LICENSE) (BSL 1.1, app layer) and [`contracts/LICENSE`](contracts/LICENSE) (MIT,
contracts). In any conflict between this summary and those files, **those files control**.

This is not legal advice. For production deployment or commercial licensing, consult a lawyer.
