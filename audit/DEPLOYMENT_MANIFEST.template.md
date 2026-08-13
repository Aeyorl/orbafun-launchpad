# Arc Testnet hardened cutover manifest

This manifest is the release artifact for Orba's fresh public Arc Testnet
experience. It does not authorize a hosted rollout or an on-chain transaction.

## Release identity

- Application base: `a77f4b9231115a77dabaeb245e3bfcbdf1536b1a` (`origin/master`)
- Remediated contract source: `9cd2049f8c9c31af45dd3f8c1b8e2d3bd63e952b`
- Cutover release commit: `<record after review and approval>`
- Network: Arc Testnet
- Chain ID: `5042002`
- Hardened TokenFactory deployment block: `56014339`
- Latest read-only verification block: `56626036` (2026-08-12)
- Solidity: `0.8.26`
- Optimizer: enabled, 200 runs
- EVM version: Cancun
- Foundry: `1.7.1` (`4072e48705af9d93e3c0f6e29e93b5e9a40caed8`)
- Forge suite: 47 passed, 0 failed, 0 skipped (2026-08-12)

Runtime hashes are Keccak-256 hashes.

| Contract | Address | Creation transaction | Raw runtime hash |
|---|---|---|---|
| ProtocolTimelock | `0x0DD8666e2819d36f01Dae53923b8A42ac5DA87ca` | `0x93fdeecf037aab67587653cad91064ce164fd63b86ca39eb827731fc4c96d22f` | `0x02dc21dcf1fb59c25f0224846cf623a7f1d70f6128fe1f318c6fd8494c7b8134` |
| Treasury | `0xDC9471561269845249614cfB4e42cFdd73F2E828` | `0xab241fc4adff16a0e2bc6b4241896e3423ab8f125ecb9aebf8c1180a9ce5328f` | `0x415a3206bc77b66a6c41e786814728250b626c2807443ab59563a130fa1f48e8` |
| AMMFactory | `0xf2FDf9ea4efEFb49910A96e959642112d1A00B8b` | `0x7209d6ff7995645ad421bfd5397c379909aed0c4c1cd569abc9a32ab8d7224d1` | `0x65387bb39db0d989d038bd50206bea8109170a448603e512f7cefbb31d193818` |
| AMMRouter | `0x3F762785CC165eFa28108649A15a70dc19D448Cd` | `0x13ed55a0b167a96ea7788a52d4d99e0653ceefde9f7bd00cb3bc5bc98be21c08` | `0x3a7774390db6c8b8340d75aa5448c71457e45d7b24ca2c20617d5a2a39be4587` |
| TokenFactory | `0xF09FC443D4f0F217F1B65d112b5fB8928a4ff09E` | `0x4736e887fff46a9574c10f5e66cec1a04c6782b2917f4450606772a8cef4dd8e` | `0x7fdd6a51bdd85083c71c6896e67725543c7fba63e50b46f27db19452e28eb411` |
| LiquidityMigration | `0x0667b432ac7beB7C4039b01C8bC979e34474313f` | `0x19dcf2fea6fece457da1eac73e370f73f6d7f793779cabcfa46d35731efed40f` | `0xd57ed90442635ae34f6237352d474f64f349242a7d3d6061d5b664954e97e15b` |

AMMRouter and LiquidityMigration contain constructor immutables. Their
immutable-normalized on-chain and local hashes are respectively
`0x51b807081b880d2857c09f8ec137a824f5da98b30446b29a5539623176574755`
and `0x7465145ae8986aa0a2eb6da538659ebd79899ed4b9829edbac037d5f946ccd6e`.

The transaction labels above are receipt-derived. They correct the prior
AMMFactory/AMMRouter swap and the prior incorrect TokenFactory and
LiquidityMigration transaction attributions.

## Verified state

- ProtocolTimelock admin: `0x33E4bd4561EE669012ff83b4eE5609122838bDcB`
- ProtocolTimelock delay: 172800 seconds (48 hours)
- Treasury, TokenFactory, AMMFactory and LiquidityMigration owner: ProtocolTimelock
- TokenFactory guardian: approved Safe
- TokenFactory paused: false
- TokenFactory creation fee: 5,000,000 base units (5 USDC)
- TokenFactory treasury and migrator match this manifest
- LiquidityMigration factory and AMMFactory match this manifest
- AMMRouter factory matches this manifest
- Safe threshold: 2 of 3; owner list was read back on 2026-08-12
- Safe modules: none
- AMMFactory `feeSetter` retains the original deployer address, but the current
  contract exposes no setter or fee path; operational ownership is the timelock.

## Application authority

Current `origin/master` already supports `TOKEN_FACTORY_ADDRESSES` and
`ARC_POLLER_REPLAY_FROM_BLOCK`; the previous compatibility blocker was
incorrect. The cutover configuration is:

```env
ARC_TOKEN_FACTORY_ADDRESS=0xF09FC443D4f0F217F1B65d112b5fB8928a4ff09E
TOKEN_FACTORY_ADDRESSES=0xF09FC443D4f0F217F1B65d112b5fB8928a4ff09E
PUBLIC_TOKEN_FACTORY_ADDRESSES=0xF09FC443D4f0F217F1B65d112b5fB8928a4ff09E
UNCAPPED_TOKEN_FACTORY_ADDRESSES=
DEPLOYER_ACTIONS_ENABLED=false
```

Replay evidence (2026-08-12): the poller replayed from block `56014339`,
persisted checkpoint `56629282` while the observed RPC head was `56629325`,
and resumed its normal five-second head-following loop. The temporary
`ARC_POLLER_REPLAY_FROM_BLOCK` override was then removed.

## Hardened canary evidence

The separately approved Arc testnet canary completed on 2026-08-13:

| Item | Verified value |
|---|---|
| Token | `0x021db5505cf4511f766967e4bed37b952088c0bc` (`TestE2E073678` / `E2E416`) |
| Bonding curve | `0xca3dad60810285e0c6c4ae4feb1dc6d22e95338c` |
| Launch transaction | `0xb2a1768e1b5f50f7d42e612fe792a230201becf195877a38431929d500b3c9d2` |
| Buy transaction | `0x3e559d001ab65db36cd811255d6c374b5d23b9f08e9cc661a213105deb985dd8` (2 USDC) |
| Sell transaction | `0x90e64c1936427a050351f7541beba0b417e3e3453d1d7cc9f2f07166fdf25a6a` (half the purchased tokens) |
| Factory | `0xF09FC443D4f0F217F1B65d112b5fB8928a4ff09E` |
| Transfer policy | `legacy_capped` |

The launch receipt contains the exact 5 USDC transfer to hardened Treasury
`0xDC9471561269845249614cfB4e42cFdd73F2E828`. The buy and sell were confirmed
and indexed, and token, trade, chart, holder, profile, position, statistics and
activity endpoints returned HTTP 200. The production coin and trade pages also
returned HTTP 200.

The wallet received `494,832.99116643024361988` tokens against a
`40,000,000` token pre-graduation maximum. A read-only over-cap transfer
simulation reverted as required. All factory, curve-USDC and curve-token
allowances were zero after execution. Receipt and log emitter enumeration found
no address from the legacy stack.

The public factory scope is an application visibility boundary. Legacy rows
remain in PostgreSQL for audit and rollback, but public queries, direct token
lookups, indexing, cache keys, WebSocket rooms and agent execution resolve only
tokens created by the hardened factory.

## Controlled rollout gates

1. Deploy API/indexer and apply the idempotent schema migration with frontend
   launch actions disabled.
2. Clear token, statistics, leaderboard, profile and activity cache namespaces.
3. Replay from block `56014339`, reach RPC head and reconcile hardened token,
   trade and graduation counts.
4. Prove representative legacy token APIs return 404 and no legacy event is
   published to global or token WebSocket rooms.
5. If deployer-funded agent launches are needed, separately simulate and
   approve a bounded USDC allowance. Never use an unlimited allowance.
6. With separate transaction approval, run one capped-factory canary and verify
   treasury fee receipt, indexing, buy/sell, 4% wallet cap and stack isolation.
7. Cut the frontend to the hardened addresses and smoke-test after removing
   the temporary replay override.

Rollback restores the previous application deployment and visibility settings.
It does not delete database evidence or modify either on-chain stack.
