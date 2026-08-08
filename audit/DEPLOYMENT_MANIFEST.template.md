# Audited deployment manifest

- Release commit: `<40-char git commit>`
- External report: `<public or access-controlled report URL>`
- Auditor fix-review commit: `<40-char git commit>`
- Solidity: `0.8.26`
- Optimizer: enabled, 200 runs
- Foundry: `<forge --version>`
- Chain ID: `<official Arc mainnet chain ID>`
- RPC verification date: `<ISO-8601>`

| Contract | Address | Creation tx | Runtime code hash |
|---|---|---|---|
| ProtocolTimelock | | | |
| Treasury | | | |
| AMMFactory | | | |
| AMMRouter | | | |
| TokenFactory | | | |
| LiquidityMigration | | | |

## Required state checks

- Timelock admin is the approved Safe and delay is at least 48 hours.
- Treasury, TokenFactory, AMMFactory and LiquidityMigration owners are timelock.
- TokenFactory guardian is the Safe; fee is 5 USDC; migrator is correct; not paused.
- AMMRouter factory is the deployed canonical AMMFactory.
- Safe owner list, threshold and implementation match the approved ceremony.
- Every runtime code hash matches the audited build artifacts.
