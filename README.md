# Orba on NEAR

Orba brings Meme.cooking auction discovery and refund and claim lookups to NEAR mainnet. Its own memecoin launchpad runs on NEAR testnet for the **Memecoins With Mechanics** track. Anyone can launch a token with an image and trade it on a USDC bonding curve. When a token crosses a trading milestone, the Rust smart contracts burn part of its reserved supply and unlock a treasury tranche for the recipient fixed at launch.

Orba existed on Arc before the hackathon. The NEAR submission covers the Rust contracts and indexer, NEAR wallet and trading flows, and on-chain milestone burns and treasury claims built for this integration.

## Try the live demo

1. Open the [WIFNEAR testnet demo](https://www.orba.fun/token/token-3.launchpad.orba-near-demo-41c9.testnet).
2. Find **Milestone progress**. It shows the first Spark milestone completed, **12M WIFNEAR** burned, and **0.0055 USDC** paid to the fixed recipient.
3. Scroll to **Milestone rules** for the thresholds and burn percentages, then **Recent trades** for the buy and sell. Follow a transaction link to verify it on NEAR testnet.

You can inspect the demo in your browser without a wallet or local setup. Use a funded NEAR testnet wallet if you want to launch or trade.

## Explore NEAR mainnet

The [Meme.cooking market](https://www.orba.fun/explore/meme-cooking) shows the public auction catalog, including auctions that did not launch. Homepage totals count catalog auctions, launched auctions, and the sum of reported wNEAR deposits for launched auctions. Deposits are distinct from secondary-market trading volume. Each listing opens the original Meme.cooking page. Use [Recovery](https://www.orba.fun/settlement) to check a NEAR mainnet account for refunds and token claims.

## Verify the mechanic

WIFNEAR crossed its first Spark milestone at **10.89 testnet USDC** in cumulative curve volume. The contract burned **12 million WIFNEAR** from its reserve and unlocked **0.0055 testnet USDC**, which the fixed recipient claimed.

- [Launch transaction](https://explorer.testnet.near.org/transactions/6tU3cdrWey53D6iSREi7tKnMwdEUbLUMBvjaUMS1SQYd)
- [Buy and milestone transaction](https://explorer.testnet.near.org/transactions/28LDkBMKhHy8GK6Br7mqDcFWz8a8xzADMzwYjMbyqRiZ)
- [Sell transaction](https://explorer.testnet.near.org/transactions/Fv3HDGSniyjmyZ8VuT3BPH4q5JtfABztaAuqHrNm3XK5)
- [Treasury claim transaction](https://explorer.testnet.near.org/transactions/2jd1RPtfmexAinkznQEvrBTxhf91DbVbuRBxYyLJj8E5)
- [60-day simulation](near/docs/SIMULATION.md) comparing supply and treasury outcomes across trading scenarios

## How it runs

| Component | Role |
| --- | --- |
| [Rust smart contracts](near/contracts) | Run on NEAR testnet and enforce token creation, trades, burns, and claims. |
| [Next.js app](apps/web) and [Rust API](near/backend) | Run on Vercel and serve the site and indexed data. Users sign transactions in their wallets. |
| Rust indexer and PostgreSQL | The indexer runs continuously on a VPS and writes finalized events to the shared database. |

See the [testnet deployment IDs](near/deployment.testnet.json), [preset and fee rules](near/docs/DECISIONS.md), and [contract and backend guide](near/README.md).

## Demo limits

- Milestones measure trading volume. One trader or a group of wallets can advance them by trading repeatedly and paying fees.
- The preset and recipient are stored at launch. The testnet deployment key can still upgrade the launchpad code.
- Historical indexing is catching up. The public [indexer status](https://www.orba.fun/api/indexer/status) shows its checkpoint.
- RHEA pool setup and swap controls are deployed for eligible new launches. Pool seeding and swaps passed in sandbox using RHEA testnet bytecode. A live graduated pool has yet to be funded. Use testnet funds only.

## Optional developer setup

### Requirements

- Rust stable and the `wasm32-unknown-unknown` target.
- Node.js 20.9+ and npm.
- PostgreSQL 17 for the API/indexer.
- A NEAR testnet account and wallet for signing testnet transactions.
- `cargo-near` and NEAR CLI for contract builds and deployment.

### Run locally

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

### Build and verify

```powershell
Push-Location near
cargo test --workspace
cargo check -p orba-near-launchpad --target wasm32-unknown-unknown
Pop-Location

npm run build
```

Run Sandbox tests in WSL after building the contracts; see [near/README.md](near/README.md) for the exact command and deployment workflow.
