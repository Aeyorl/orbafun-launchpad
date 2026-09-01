# Orba remediated Arc testnet deployment — 2026-09-01 R2

## Scope

This records the Arc testnet deployment of source revision
`eb0c3c30f11b7a442db1159ef604de69607d9087`. It is testnet deployment evidence,
not a mainnet-readiness claim or a substitute for an independent audit.

- Chain ID: `5042002`
- First deployment block: `59881981`
- Deployer: `0x74E931264f0f83F6c22d263efD8aA719D5e7f337`
- Administrative Safe: `0x33E4bd4561EE669012ff83b4eE5609122838bDcB`
- Timelock delay: `172800` seconds
- Foundry tests before deployment: `59 passed, 0 failed`

## Contracts and creation transactions

| Contract | Address | Creation transaction |
|---|---|---|
| ProtocolTimelock | [`0xDd139CD311278C385cB4d578f76cc51aaece9e7d`](https://testnet.arcscan.app/address/0xdd139cd311278c385cb4d578f76cc51aaece9e7d) | [`0x39dcecfa3609ef8c71f1b59bc3da9fc24eff80f5770d6af18fea543660aa9137`](https://testnet.arcscan.app/tx/0x39dcecfa3609ef8c71f1b59bc3da9fc24eff80f5770d6af18fea543660aa9137) |
| Treasury | [`0x26770f604415be9DaBB7211a8d272D4EDB32d9c3`](https://testnet.arcscan.app/address/0x26770f604415be9dabb7211a8d272d4edb32d9c3) | [`0xcba208bf392f4c0036dcc28e3def4833f1da8708d9bafde284d5ce85cf0d9912`](https://testnet.arcscan.app/tx/0xcba208bf392f4c0036dcc28e3def4833f1da8708d9bafde284d5ce85cf0d9912) |
| AMMFactory | [`0x50432933755E3d292eE2d7589c3CFab18f5d87BD`](https://testnet.arcscan.app/address/0x50432933755e3d292ee2d7589c3cfab18f5d87bd) | [`0x07daaff461a234932af4305fe0b3ee7653851803625de9a647c8da00e0f84c64`](https://testnet.arcscan.app/tx/0x07daaff461a234932af4305fe0b3ee7653851803625de9a647c8da00e0f84c64) |
| AMMRouter | [`0x0459984dEE1b0d7b3D031E28f1A68f4DdEC50A6A`](https://testnet.arcscan.app/address/0x0459984dee1b0d7b3d031e28f1a68f4ddec50a6a) | [`0xd4658098bcf904ab4c9bff7dc421009ed12e1f4c692031fd64c55e22012e2d3a`](https://testnet.arcscan.app/tx/0xd4658098bcf904ab4c9bff7dc421009ed12e1f4c692031fd64c55e22012e2d3a) |
| TokenFactory | [`0xD6e64999f94e31a290CE006dD2D8dAEA5846b81E`](https://testnet.arcscan.app/address/0xd6e64999f94e31a290ce006dd2d8daea5846b81e) | [`0x7d5acf8fd5b48dc0b2265c2df81530a93d4fcab40eb138b604786cadca7492b4`](https://testnet.arcscan.app/tx/0x7d5acf8fd5b48dc0b2265c2df81530a93d4fcab40eb138b604786cadca7492b4) |
| LiquidityMigration | [`0x07106479Cd70BE67378dA39afB846b363F00cDfe`](https://testnet.arcscan.app/address/0x07106479cd70be67378da39afb846b363f00cdfe) | [`0x2cedb71d6fd263cfdd334c466a1de31dbb4b8e0e6699b65e3bbba7e3d3af070e`](https://testnet.arcscan.app/tx/0x2cedb71d6fd263cfdd334c466a1de31dbb4b8e0e6699b65e3bbba7e3d3af070e) |

## Verification and wiring

Arcscan's contract API independently returned `is_verified=true`,
`is_partially_verified=false`, and `is_changed_bytecode=false` for all six
contracts using Solidity `v0.8.26+commit.8a97fa7a`.

Read-only on-chain checks confirmed:

- Timelock admin is the Safe; delay is 48 hours and grace period is 14 days.
- Treasury, AMMFactory, TokenFactory, and LiquidityMigration are owned by the timelock.
- The AMMRouter is authorized; LiquidityMigration is the only authorized pair creator from this deployment, and the deployer is not authorized.
- Router, factory, treasury, and migration references point only to this deployment.

The Foundry broadcast evidence is stored under
`contracts/broadcast/DeployArcFun.s.sol/5042002/`.
