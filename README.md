# Orba on NEAR

Orba is a NEAR token launchpad built with Rust smart contracts and a Rust API/indexer. The web app supports token creation, bonding-curve buys and sells, milestone reserved-supply burns, fixed-recipient treasury unlocks, and recipient claims. The current deployment target is NEAR testnet.

## Project layout

- `near/contracts/token`: NEP-141 token with NEP-148 metadata.
- `near/contracts/launchpad`: token launches, curve trading, milestone mechanics, and claim-based payouts.
- `near/backend`: Axum API, PostgreSQL migrations, and finalized-block event indexer.
- `near/sandbox-tests`: NEAR Sandbox integration suite.
- `apps/web`: Next.js testnet interface at `/near-demo` (the home route redirects there).
- `near/docs/DECISIONS.md`: curve, fee, burn, and treasury preset decisions.
- `near/deployment.testnet.json`: public testnet deployment identifiers.

## Requirements

- Rust stable and the `wasm32-unknown-unknown` target.
- Node.js 20+ and npm.
- PostgreSQL 17 for the API/indexer.
- A NEAR testnet account and wallet for signing testnet transactions.
- `cargo-near` and NEAR CLI for contract builds and deployment.

## Run locally

Set the public NEAR testnet values in `apps/web/.env.local` (see `.env.example`). Start the isolated API and database from WSL:

```powershell
.\near\scripts\start-local-api.ps1
```

In another terminal, run the web app:

```powershell
npm install
npm run dev:web
```

Open `http://localhost:3000`. The API health endpoint is `http://127.0.0.1:4001/health`.

## Build and verify

```powershell
Push-Location near
cargo test --workspace
cargo check -p orba-near-launchpad --target wasm32-unknown-unknown
Pop-Location

npm run build
```

Run Sandbox tests in WSL after building the contracts; see [near/README.md](near/README.md) for the exact command and deployment workflow.

## Deployment and safety

The checked-in deployment is testnet-only. The web interface signs transactions through the connected NEAR wallet; the Rust API indexes finalized events and does not hold user signing keys. Never commit account keys, API secrets, or `.env.local`. Mainnet use requires a separately reviewed deployment, verified contract configuration, operational monitoring, and an independent smart-contract audit.
