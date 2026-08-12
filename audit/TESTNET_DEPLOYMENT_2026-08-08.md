# Hardened Arc testnet deployment evidence — 2026-08-08

This is a parallel testnet deployment of commit
`9cd2049f8c9c31af45dd3f8c1b8e2d3bd63e952b`. It is not the stack currently
used by the public Orba site and is not an external audit or mainnet approval.

- Chain ID: `5042002`
- Safe: `0x33E4bd4561EE669012ff83b4eE5609122838bDcB`
- Timelock delay: 172800 seconds (48 hours)
- Foundry: 1.7.1
- Solidity: 0.8.26, optimizer enabled with 200 runs

| Contract | Address | Creation transaction | Runtime code hash |
|---|---|---|---|
| ProtocolTimelock | `0x0DD8666e2819d36f01Dae53923b8A42ac5DA87ca` | `0x93fdeecf037aab67587653cad91064ce164fd63b86ca39eb827731fc4c96d22f` | `0x02dc21dcf1fb59c25f0224846cf623a7f1d70f6128fe1f318c6fd8494c7b8134` |
| Treasury | `0xDC9471561269845249614cfB4e42cFdd73F2E828` | `0xab241fc4adff16a0e2bc6b4241896e3423ab8f125ecb9aebf8c1180a9ce5328f` | `0x415a3206bc77b66a6c41e786814728250b626c2807443ab59563a130fa1f48e8` |
| AMMFactory | `0xf2FDf9ea4efEFb49910A96e959642112d1A00B8b` | `0x7209d6ff7995645ad421bfd5397c379909aed0c4c1cd569abc9a32ab8d7224d1` | `0x65387bb39db0d989d038bd50206bea8109170a448603e512f7cefbb31d193818` |
| AMMRouter | `0x3F762785CC165eFa28108649A15a70dc19D448Cd` | `0x13ed55a0b167a96ea7788a52d4d99e0653ceefde9f7bd00cb3bc5bc98be21c08` | `0x3a7774390db6c8b8340d75aa5448c71457e45d7b24ca2c20617d5a2a39be4587` |
| TokenFactory | `0xF09FC443D4f0F217F1B65d112b5fB8928a4ff09E` | `0x4736e887fff46a9574c10f5e66cec1a04c6782b2917f4450606772a8cef4dd8e` | `0x7fdd6a51bdd85083c71c6896e67725543c7fba63e50b46f27db19452e28eb411` |
| LiquidityMigration | `0x0667b432ac7beB7C4039b01C8bC979e34474313f` | `0x19dcf2fea6fece457da1eac73e370f73f6d7f793779cabcfa46d35731efed40f` | `0xd57ed90442635ae34f6237352d474f64f349242a7d3d6061d5b664954e97e15b` |

The transaction-to-contract labels above were revalidated from Arc Testnet
receipts on 2026-08-12. Earlier revisions had the AMMFactory/AMMRouter labels
swapped and attributed unrelated creation transactions to TokenFactory and
LiquidityMigration.

## Application cutover compatibility

Current `origin/master` at `a77f4b9231115a77dabaeb245e3bfcbdf1536b1a`
already supports `TOKEN_FACTORY_ADDRESSES` and
`ARC_POLLER_REPLAY_FROM_BLOCK`. The fresh-start release intentionally narrows
both indexed and publicly visible factory scopes to the hardened TokenFactory
only; legacy rows remain stored but are not returned or polled.

## State verification

- Safe threshold is 2-of-3 and the three expected owners are present.
- Safe is timelock admin and TokenFactory pause guardian.
- Treasury, AMMFactory, TokenFactory and LiquidityMigration owners are the timelock.
- TokenFactory treasury and migrator point to this deployment; creation fee is
  5 USDC and the factory is not paused.
- AMMRouter points to the deployed AMMFactory.
- Runtime lengths matched local build artifacts. After masking only compiler
  immutable-reference offsets on AMMRouter and LiquidityMigration, every
  runtime had zero non-immutable byte differences.

## Mechanics evidence

Token `0xA97c5E4Ad40dEe778B71976Ebb131C9356C59Bfa` and curve
`0x54d889f73269BDe17e8313bec8372D0893d111A6` were created through this factory.
Launch, 2 USDC buy, and half-position sell all succeeded. Factory, curve-USDC,
and curve-token allowances were all zero after the exact approvals were used.

The same curve then received concurrent 0.1 USDC buys from nine funded wallets:

- Successful buys: 9/9 (100%)
- Contract reverts: 0
- Throughput: 0.84 transactions/second
- Average transaction duration: 10.48 seconds
- On-chain state integrity: pass
- Indexer lag: not measured because the parallel factory is intentionally not
  connected to the live backend.

One of ten funding operations failed because the fallback RPC returned a stale
deployer nonce. The buy phase used the nine successfully funded wallets and had
no failure. The harness now pins sequential funding nonces to prevent recurrence.

## Live graduation evidence

A low-threshold TestBondingCurve ceremony was executed against the hardened
deployment's AMMFactory on 2026-08-09:

- TestTokenFactory: `0xd0874625a8384e250db3f25322d166b13279b3b9`
- LiquidityMigration: `0x6e8c76ab9ce06d32fb9b9c63637a5df834d7431e`
- Token: `0x25bddafe8b207ffb5bf5399dbc26a636b8ff3701`
- Curve: `0x3763b72b1bf81609f75a4dc803e7cee4d99cbc21`
- AMM pair: `0xf65F3A0B6134D4777485d48DCF42D93C46629053`
- Launch transaction: `0xfbdddadc6752f600957bd8983428b98e620733ac1845ca2ebf529ad228207534`
- 120 USDC buy transaction: `0x9327b05531c972dd0125f1f692c30db987f08c720d4a9f9b4d7ced1a79e01401`
- Migration transaction: `0x15a662fa1d391ab6dab80904bf9a80c62a7a687bbfc0d3260ba63e3a0f6ca5d2`
- Market cap: $4,000.000021 before, $4,163.640271 after; graduation threshold
  was $4,150.
- AMM liquidity: 120,000,000 tokens and 118.8 USDC.
- LP burn: 0.119398492452793394 of 0.119398492452794394 LP, effectively 100%.
- All seven anti-rug assertions passed: pair funded, LP burned, token owner
  zeroed, token graduated, bonding curve zeroed, curve graduated, and factory
  graduation flag set.

## Remaining limitations

- The parallel stack is not connected to the production indexer or frontend.
- External audit and auditor fix review remain mandatory before mainnet.
