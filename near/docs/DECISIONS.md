# NEAR migration decisions

Status: demo defaults for the first NEAR testnet implementation. Presets are immutable per token at creation.

## Presets

All volume thresholds are cumulative net USDC entering the curve, in micro-USDC. Each threshold is tested once and in order. The final milestone uses the remaining balance so integer rounding cannot strand reserved tokens or treasury funds.

| Preset | Thresholds (USDC) | Reserved supply burn | Treasury pool unlock |
| --- | --- | --- | --- |
| Spark | 10 / 50 / 150 | 10% / 25% / 100% of remaining | 20% / 30% / 100% of pool |
| Momentum | 25 / 100 / 500 | 10% / 25% / 100% of remaining | 20% / 30% / 100% of pool |
| Marathon | 100 / 500 / 2,500 | 10% / 25% / 100% of remaining | 20% / 30% / 100% of pool |

## Fee and treasury funding interpretation

The existing 1% trade fee remains split 50/50 between creator and protocol. To fund a token-specific treasury without introducing a new fee, the protocol half is split evenly: half remains general protocol revenue and half is added to that token's milestone treasury pool. This is a product assumption because the brief defined unlock behavior but did not define the funding source. A treasury recipient is fixed at token creation; only it may claim unlocked tranches.

## Curve and launch behavior

After the final burn settles, the treasury share of each subsequent settled trade becomes immediately claimable by the fixed recipient. The final milestone count and token supply stay fixed.

- 1B total supply; 880M initially on the curve; 120M reserved at launch.
- Existing constant product virtual reserves and integer rounding are ported unchanged. Reserved burns affect only the launchpad's reserved balance and never curve reserves or quotes.
- 1% fee; 50% creator and 50% protocol split before the protocol/treasury allocation described above.
- No USDC launch fee. Creating a NEAR subaccount and deploying its code costs NEAR storage/deposit; the creator attaches this network cost. It is not a platform launch fee.
- Graduation locks curve trading at the existing $30,000 market-cap threshold or when the 880M curve inventory is exhausted, whichever occurs first. Exhaustion is a terminal state because further buys cannot receive curve tokens. AMM migration is outside this first NEAR milestone.
- Creators claim their accrued fee balance; only the launchpad owner can claim protocol fees. Both claims use asynchronous USDC transfers and restore the balance if transfer settlement fails.
- Cross-contract payouts update claimable state before transfer and use private callbacks to restore claim accounting on failure.

## DEX liquidity allocation

New launches in the next contract version allocate 800M tokens to curve sales,
120M to milestone burns, and 80M to future DEX liquidity. Existing launches
retain the 880M curve cap and have no DEX allocation. All launches start with
1B supply and use the same virtual reserves and fee calculation.

With the current virtual reserves, a single buy that exhausts the smaller curve
leaves roughly 7,040 USDC at a quoted market cap of 19,360 USDC. Seeding all 80M
DEX tokens at that final curve price would use roughly 1,548.80 USDC. The migration
holds the surplus as per-token curve USDC at the launchpad. The deployed code
will expose no withdrawal method for this surplus or for the RHEA LP shares
held by the launchpad. A future contract upgrade could change that policy.

The migration targets RHEA testnet exchange `ref-finance-101.testnet` with a
30 bps pool fee. Anyone can call `advance_dex_migration` after graduation and
settlement, paying the step's deposit. `get_dex_migration` reports progress,
the pool ID, seed amounts, retained USDC, and confirmed LP shares. The nine
steps require, in order, 0.02 NEAR, 0.00125 NEAR, 0.00125 NEAR, 1 yoctoNEAR,
0.1 NEAR, 1 yoctoNEAR, 1 yoctoNEAR, 0.01 NEAR, and zero. Use 150 Tgas or more
per step. A failed token transfer resolver leaves that step locked for
reconciliation because the exchange might already have credited the funds.
The opt-in sandbox test imports RHEA's testnet WASM, initializes fresh
exchange state, seeds the pool, verifies launchpad LP ownership, and executes
a swap. After building both contract WASM artifacts, run it with:

```sh
cargo test --locked --manifest-path near/sandbox-tests/Cargo.toml graduates_into_rhea_and_swaps -- --ignored
```

The live contract upgrade and website swap wiring are pending.

## Network and scope

The initial release targets NEAR testnet. Milestone burns and treasury unlocks are core NEAR launchpad behavior. Mainnet deployment is outside this release scope.
