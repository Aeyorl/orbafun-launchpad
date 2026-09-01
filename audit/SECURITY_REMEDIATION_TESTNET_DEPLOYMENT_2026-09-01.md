# Security Remediation Testnet Deployment — 2026-09-01

## Scope

This record covers the Arc testnet deployment of the contract changes for the
September 2026 security-remediation release. It is testnet evidence only. It is
not an external audit, a mainnet authorization, or a guarantee that no other
vulnerabilities exist.

- Chain ID: `5042002`
- Deployment start block: `59870676`
- Contract and wiring completion block: `59870678`
- Release source commit: `ba45225`
- Protocol Safe: `0x33E4bd4561EE669012ff83b4eE5609122838bDcB`
- Timelock delay: `172800` seconds (48 hours)

## Deployed contracts

| Contract | Address | Deployment transaction |
| --- | --- | --- |
| ProtocolTimelock | `0x23a038742a12d9D8ABcfF62c5bFA36b608fFe17e` | `0x77f3b1d83dbe7501c5e35138f4f885ff569726e6ce79fe1d2e8cc777121e4b2c` |
| Treasury | `0x41712d8cebdAfc5b7eac343F2add73288248bd5c` | `0x5b581bad46356b9c7fda49fe49c7402cb38ace0019cceb92c8437f1387d25a5c` |
| AMMFactory | `0x9f2E34c3A32819268E6e37c0Cb76F53724F222b1` | `0x7d56561e0372a3ad035d26450ad0c78c8717cbfa39fc327cea4d2269c2737229` |
| AMMRouter | `0x194f27364bAdE80DF0C5b4f31CcE667FF6ea8F39` | `0x3e10f42c5dc3f52d9b7f397b9af644a5ac57930b47d7e2448f646e29a92ff9ce` |
| TokenFactory | `0x3dD9bA8Aa1d92ebfdBE10438618d643757bE64B3` | `0x4308ffc65494f20ab1871499eb8cc8cc456b95f52930560a3974d37391fdf52d` |
| LiquidityMigration | `0x93E16Bd952E3d60a99E27BB7ED06A612Def7a77d` | `0x9eb755e6bbf0724201ea657d68645e02bdfec2b370c6179370477ac69d70e206` |

## Wiring transactions

| Action | Transaction |
| --- | --- |
| Authorize the migrator as pair creator | `0x57dfddd50dba316372e72955d4c48b26f298117da430ece76952dfcb3ff70418` |
| Revoke deployer pair-creator permission | `0x10f2d9a5f64efa5e0bfa50f61ee10804d673b6aec479f371606492d7010cc436` |
| Set TokenFactory migrator | `0x539416c35bd30fd6523f235d32276b8d775e7a653d736f997c32edf06ee5128a` |
| Set Safe pause guardian | `0x4ddd9a8103d540e28cf9fd8efe110ec6b18c14ac47af49d7e689e72e7f47e706` |
| Transfer Treasury ownership to timelock | `0xeaa15d64467964bfa3b73e9bf9980898416887cc16300df6b0aa1785d7131754` |
| Transfer AMMFactory ownership to timelock | `0x63a91b82f8242a329e690cd2669e09fce079a2cbc2027949f49e6389d491a3cb` |
| Transfer TokenFactory ownership to timelock | `0x6ff549f20f07226ba51f98f52c9ee658863db5a5af766d1b6e8dbeb6714ece4e` |
| Transfer LiquidityMigration ownership to timelock | `0xb1d52ce4abd7d6992f087342cbc51258c8c51f6689f3651586862585904103a4` |

## Verification performed

- The six deployed runtime bytecodes matched the locally tested Foundry
  artifacts after masking only compiler-declared immutable slots.
- Treasury, AMMFactory, TokenFactory, and LiquidityMigration report the new
  ProtocolTimelock as owner.
- ProtocolTimelock reports the Safe as admin and a `172800` second delay.
- TokenFactory reports the new LiquidityMigration and the Safe pause guardian.
- LiquidityMigration reports the new TokenFactory and AMMFactory.
- AMMRouter reports the new AMMFactory.
- AMMFactory reports the new migrator as an authorized pair creator and the
  deployment EOA as unauthorized.

## Public cutover verification

- GitHub `master` advanced to release commit `963df8d`.
- Vercel production deployment `dpl_2Q9XPzC3LXavMNMASB4KmTTc39yL` reached
  `Ready` and received the `orba.fun` and `www.orba.fun` aliases.
- `GET /health/ready` returned HTTP 200 with `x-ratelimit-limit: 30`.
- Unauthenticated `POST /upload/image` returned HTTP 401.
- The one-release indexer replay started at block `59870676`. After the new
  factory events were indexed, the replay override was disabled so subsequent
  restarts use the persisted high-water mark.

### Live launch, buy, and sell canary

| Item | Value |
| --- | --- |
| Token | `0xb2eeeb34fda66fa82d722cdc778d0ef4cae7622f` |
| Bonding curve | `0xb11073e4e4ade82b46d2bf86707d105a7d911846` |
| Launch transaction | `0x6db3a2d7cf539732b98c948bfee3ad7bfa398e56e8e5f76be3741bd5861d03c3` |
| Buy transaction | `0x287efb8656a375cd1d3a290ccbb8621a04d45eccacc2bdf91ff93e29bef6fb50` |
| Sell transaction | `0x2f8092354efae9076228dbccc570ea696980c50057d640b0a9b8168629e983f6` |

The launch appeared in the public API after 15 seconds. The buy and sell each
appeared after 7.3 seconds. The production-threshold graduation path was covered
by the 56-test local Foundry suite, including automatic migration and the
pre-created-pair regression. It was not repeated against this deployed factory
because the testnet wallet did not hold the roughly 9,000 USDC required to reach
the production graduation threshold.
