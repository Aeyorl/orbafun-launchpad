# Safe owner and recovery drill evidence — 2026-08-30

## Status and scope

- Arc Testnet 2-of-3 signing rehearsal: **PASS**
- Arc Testnet unavailable-owner recovery drill: **PASS**
- Final owner and threshold restoration: **PASS**
- Owner hardware-custody and seed-isolation attestations: **RECORDED**
- Network: Arc Testnet, chain ID `5042002`
- Safe: `0x33E4bd4561EE669012ff83b4eE5609122838bDcB`
- Safe contract version: `1.4.1` (`1.4.1+L2` in Safe Wallet)

This is Arc Testnet operational evidence. It is not an external audit, a
production Safe deployment, a mainnet approval, or authorization to transfer
production timelock or contract ownership. The mainnet release remains **NO-GO**
until every release gate in `docs/MAINNET_RUNBOOK.md` is independently closed.

## Final verified configuration

The final state was read directly from Arc Testnet after the restoration
transaction, at block `59514379` or later.

| Item | Verified value |
| --- | --- |
| Owners | 3 |
| Threshold | 2 |
| Safe nonce | 5 |
| Native testnet USDC balance | 0.09 USDC |
| Owner 1 | Aeyo / Founder — `0x74E931264f0f83F6c22d263efD8aA719D5e7f337` |
| Owner 2 | Enema / Dev — `0xd60eB2BbD993CA5e36FFA43E9A41845dE76576c4` |
| Owner 3 | Joy / HR — `0xf7ad5f6ED3896cB1BDFAEca8AC031c0634cf7842` |

The three addresses are valid checksummed EVM addresses, are distinct, and
match the final on-chain Safe owner set. No seed phrase, private key, PIN, or
recovery word was collected or stored.

## Transaction evidence

All timestamps below are canonical block timestamps in UTC.

| Purpose | Transaction | Block / UTC | Verified result |
| --- | --- | --- | --- |
| Fund rehearsal Safe | [`0x1d1b1a2a18ebacd295411543196d4ad3f3ef83578c387741500c673afe26f44c`](https://testnet.arcscan.app/tx/0x1d1b1a2a18ebacd295411543196d4ad3f3ef83578c387741500c673afe26f44c) | `59503667` / `2026-08-29T21:55:14Z` | Aeyo sent 0.10 native testnet USDC to the Safe. |
| 2-of-3 transfer rehearsal | [`0xce083df26741831041285f3126be84b7343eaaeb4e02aaf1cd7a825cf0bbe409`](https://testnet.arcscan.app/tx/0xce083df26741831041285f3126be84b7343eaaeb4e02aaf1cd7a825cf0bbe409) | `59512144` / `2026-08-29T23:08:12Z` | Aeyo and Enema authorized; Enema executed. The Safe sent exactly 0.01 native testnet USDC to Aeyo. |
| Simulate unavailable owner | [`0x300170a0cbff002d9487bfeb054630bd164bae10421e492c27398e198e18da25`](https://testnet.arcscan.app/tx/0x300170a0cbff002d9487bfeb054630bd164bae10421e492c27398e198e18da25) | `59512762` / `2026-08-29T23:13:31Z` | Aeyo and Joy authorized without Enema; Joy executed. Enema was removed and the Safe became 2-of-2. |
| Restore original owner | [`0xa4d3f2bfa361f247ba2835f9b581accfe7596e8948bd8d681fbb6b39d212b829`](https://testnet.arcscan.app/tx/0xa4d3f2bfa361f247ba2835f9b581accfe7596e8948bd8d681fbb6b39d212b829) | `59514279` / `2026-08-29T23:26:36Z` | Aeyo and Joy authorized; Aeyo executed. Enema was restored and the Safe returned to 2-of-3. |

## Independent on-chain validation

The rehearsal transactions were decoded and checked against the Safe contract:

- The transfer called `execTransaction` with inner recipient Aeyo, value
  `10000000000000000` base units (0.01 native USDC), empty data, and operation
  `0` (`CALL`). Its Safe transaction hash is
  `0xd9d1f2c645d957f56c855346a816348c097e0ac26896fed545abfef3e7e9e4a8`.
- The removal decoded to `removeOwner(Aeyo, Enema, 2)`. Its Safe transaction
  hash is
  `0xed5f3da5f1aacb90063fa1e3d3538a15cc733e38cd9ab89586f69a059e06ae8c`.
- The restoration decoded to `addOwnerWithThreshold(Enema, 2)`. Its Safe
  transaction hash is
  `0x4fc85b6a8c28be911d5642f27caea634da53175aa0e92ff26059ad8a8d51aac7`.
- The submitted Safe signature payloads identify Aeyo and Enema for the
  transfer, and Aeyo and Joy for both recovery operations.
- Each Safe execution emitted `ExecutionSuccess`, each outer receipt succeeded,
  and the nonce advanced from 2 through 5.

The removal deliberately tested recovery without the unavailable owner's
participation. The Safe was left 2-of-2 only for the short test interval and was
restored immediately to the intended three-owner, threshold-two configuration.

## Owner custody attestations

These are human custody declarations. The successful Safe transactions prove
control of each owner address during the drill; the hardware-wallet and
seed-isolation statements remain owner attestations and do not disclose or
cryptographically reveal recovery material.

### Joy / HR

> I, Joy and Hr, confirm that address
> `0xf7ad5f6ED3896cB1BDFAEca8AC031c0634cf7842` is controlled through my
> independently held hardware wallet. Its seed/recovery phrase is unique, has
> not been shared with another Safe owner, and was not entered into a browser,
> website, chat, CI system, or production server.
>
> I personally verified my address on the hardware-wallet screen and
> participated in the Orba Arc Testnet Safe signing drill on 2026-08-30.

- Signed: Joy
- Role: HR
- Date: `2026-08-30`

### Enema / Dev

> I, Enema and Dev, confirm that address
> `0xd60eB2BbD993CA5e36FFA43E9A41845dE76576c4` is controlled through my
> independently held hardware wallet. Its seed/recovery phrase is unique, has
> not been shared with another Safe owner, and was not entered into a browser,
> website, chat, CI system, or production server.
>
> I personally verified my address on the hardware-wallet screen and
> participated in the Orba Arc Testnet Safe signing drill on 2026-08-30.

- Signed: Enema
- Role: Dev
- Date: `2026-08-30`

### Aeyo / Founder

> I, Aeyo and Founder, confirm that address
> `0x74E931264f0f83F6c22d263efD8aA719D5e7f337` is controlled through my
> independently held hardware wallet. Its seed/recovery phrase is unique, has
> not been shared with another Safe owner, and was not entered into a browser,
> website, chat, CI system, or production server.
>
> I personally verified my address on the hardware-wallet screen and
> participated in the Orba Arc Testnet Safe signing drill on 2026-08-30.

- Signed: Aeyo
- Role: Founder
- Date: `2026-08-30`

## Operational conclusion

The Arc Testnet Safe demonstrated that two owners can authorize a value
transfer, remove an unavailable owner, and restore the original owner while
maintaining a threshold of two. All three owners exercised their hardware-backed
addresses during the rehearsal, and the final configuration matches the
intended 2-of-3 policy.

For production, repeat the configuration and evidence checks against the final
mainnet Safe, confirm the approved timelock/guardian topology, and preserve the
mainnet Safe address and transaction hashes in the signed deployment manifest.
