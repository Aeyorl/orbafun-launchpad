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

- 1B total supply; 880M initially on the curve; 120M reserved at launch.
- Existing constant product virtual reserves and integer rounding are ported unchanged. Reserved burns affect only the launchpad's reserved balance and never curve reserves or quotes.
- 1% fee; 50% creator and 50% protocol split before the protocol/treasury allocation described above.
- No USDC launch fee. Creating a NEAR subaccount and deploying its code costs NEAR storage/deposit; the creator attaches this network cost. It is not a platform launch fee.
- Graduation is recorded at the existing $30,000 market-cap threshold and locks curve trading in this demo. AMM migration is outside this first NEAR milestone.
- Cross-contract payouts update claimable state before transfer and use private callbacks to restore claim accounting on failure.

## Network and scope

The initial release targets NEAR testnet. Milestone burns and treasury unlocks are core NEAR launchpad behavior. Mainnet deployment is outside this release scope.
