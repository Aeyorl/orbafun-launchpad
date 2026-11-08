# Orba NEAR project guide

## Product and architecture

Orba is a token launchpad on NEAR. Smart contracts and the API/indexer are written in Rust; the interface is Next.js. The supported deployment in this repository is NEAR testnet.

- `near/contracts/token`: NEP-141 fungible token and NEP-148 metadata.
- `near/contracts/launchpad`: token creation, bonding-curve trading, reserved-supply burns, milestone treasury unlocks, and claim payouts.
- `near/backend`: Axum API, PostgreSQL persistence, and finalized NEAR event indexing.
- `apps/web/src/app/near-demo`: wallet connection, create/trade, storage registration, balances, mechanics, and claims.
- `near/sandbox-tests`: cross-contract Sandbox coverage.
- `near/docs/DECISIONS.md`: economics and milestone presets.

## Core mechanics

- 1B total token supply: 880M curve inventory and 120M reserved inventory.
- Reserved tokens are the only burn source; burns do not change curve inventory or pricing state.
- Trading fee is 1%, split evenly between creator and protocol/treasury accounting as specified in the NEAR decision record.
- Each launch fixes its treasury recipient and milestone preset.
- Threshold crossings burn the configured share of remaining reserve and unlock claimable treasury funds.
- Treasury and seller claims update accounting before asynchronous transfer and restore claimability in private callbacks on failure.
- Graduation locks curve trading at the configured market-cap threshold.

## Development

Use the NEAR project scripts and docs. From the repository root:

```powershell
npm install
npm run dev:web
npm run build
Push-Location near
cargo test --workspace
cargo check -p orba-near-launchpad --target wasm32-unknown-unknown
Pop-Location
```

On Windows, the Rust API and PostgreSQL development stack is launched with `near/scripts/start-local-api.ps1` under WSL2. Keep its database and RPC configuration scoped to the NEAR testnet deployment.

## Engineering guidance

- Inspect current files and manifests before changing architecture.
- Keep integer economics in Rust and avoid floating-point arithmetic for token amounts, fees, or quotes.
- Preserve user wallet custody: the browser wallet signs writes; API credentials never sign user transactions.
- Keep indexing idempotent by transaction/event identity and advance only finalized checkpoints.
- Never commit secrets or wallet keys. Keep local environment files ignored.
- Run focused checks for changed modules and state exactly what passed.

## UI copy

Avoid unnecessary secondary labels and descriptions. Let the layout do the explaining.
