# Uncapped Arc testnet deployment — 2026-08-13

## Release

- Source commit: `3669904ec2dcaab19fa1b040e57c74ce8aa22a24`
- Chain ID: `5042002`
- Solidity: `0.8.26`
- Optimizer: enabled, 200 runs
- EVM version: Cancun
- Forge suite: 47 passed, 0 failed, 0 skipped

## Contracts

| Contract | Address | Creation transaction | Block |
|---|---|---|---:|
| TokenFactory | `0xa37328243c5b3204AF18e04446bD007272442605` | `0x5aa14e6782cfa69f41d5768a9ba648ef3f8c45b695e37bc77aa036ed1cc5a263` | 56707767 |
| LiquidityMigration | `0x20e40978791cbaA6918634faFF6A68d95C173743` | `0x51da18ad197d94f248e1b7f1e6fa495438244ab1c8684bc30f8a65a69d1a8d5b` | 56707774 |

## Configuration transactions

| Action | Transaction |
|---|---|
| Set migrator | `0x1e38242dbadd99be3422107393cb39f0e20a1dae551ab2e55d8838872e119893` |
| Set pause guardian | `0xa7ed75bd2c1db1b39e2a4bb3477e3895c59913d8f04f94bcded90a88f28ec78d` |
| Transfer factory ownership to timelock | `0xf47c2ad78686a164141a15e473e31700a552c73942a40331a5af4f0f47fc9e22` |
| Transfer migrator ownership to timelock | `0xb8c65bff1887cfa255122468f1b9d71df5e897eb22699d24627351d76043840d` |

All six receipts succeeded.

## Runtime and wiring verification

- TokenFactory runtime Keccak-256: `0x4607ce95ab4a26cf38dec0000ceeabd8c1fb54bb3944dc24a88ed6c64f33ed5d` (exact local match)
- LiquidityMigration raw runtime Keccak-256: `0x56e02ce2a7cb660dbb689987c5fd258aa7cf69ae47a31d65c6e3bf9f846511fb`
- LiquidityMigration immutable-normalized Keccak-256: `0x238f1ed90ecb79c37a691dbc6d0603abedf32c058f84bc7ea2d9ff9c5437eea3` (local match)
- Owner: ProtocolTimelock `0x0DD8666e2819d36f01Dae53923b8A42ac5DA87ca`
- Pause guardian: Safe `0x33E4bd4561EE669012ff83b4eE5609122838bDcB`
- Treasury: `0xDC9471561269845249614cfB4e42cFdd73F2E828`
- AMMFactory: `0xf2FDf9ea4efEFb49910A96e959642112d1A00B8b`
- Creation fee: 5 USDC
- Factory paused: false

The factory uses the uncapped MemeToken implementation. Fixed one-billion-token
supply and the 30-block pre-graduation cooldown remain unchanged.
