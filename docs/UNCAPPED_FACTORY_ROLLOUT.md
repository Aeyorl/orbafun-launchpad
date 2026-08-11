# Uncapped TokenFactory rollout

This rollout removes the pre-graduation 4% receiver cap for newly launched
tokens only. Existing tokens are immutable and remain `legacy_capped`.

## Deployment impact

- `TokenFactory` must be redeployed because its creation bytecode embeds
  `MemeToken`.
- `LiquidityMigration` must be redeployed because its factory reference is
  immutable.
- Treasury, AMMFactory, AMMRouter, the Safe, and ProtocolTimelock are reused.
- The old factory stays indexed so its tokens remain discoverable and keep the
  correct legacy trading warning.

## Testnet cutover

1. Run the full Forge suite.
2. Deploy `DeployUncappedFactory.s.sol` with the existing Treasury, AMMFactory,
   Safe and timelock addresses. Record the new factory, migrator and deployment
   block printed by the script.
3. Verify the new factory and migrator bytecode and ownership on ArcScan.
4. Add both old and new factory addresses to `TOKEN_FACTORY_ADDRESSES`.
5. Add only the new address to `UNCAPPED_TOKEN_FACTORY_ADDRESSES` and
   `NEXT_PUBLIC_UNCAPPED_TOKEN_FACTORY_ADDRESSES`.
6. Set `ARC_POLLER_REPLAY_FROM_BLOCK` to the new factory deployment block for
   the first API rollout. Event writes are idempotent, so replaying overlap is
   safe. Remove this override after catch-up is verified.
7. Point `ARC_TOKEN_FACTORY_ADDRESS` and
   `NEXT_PUBLIC_TOKEN_FACTORY_ADDRESS` at the new factory. Point the migrator
   variables at the new factory-specific migrator.
8. Launch a canary token and verify: the emitted factory address and `uncapped`
   policy, a pre-graduation holding above 4%, normal cooldown/slippage/balance
   behavior, indexing, profile accounting, graduation, LP burn and ownership
   renunciation.

## Rollback

Pause the new factory through the Safe/timelock controls and restore the old
factory as the launch target. Keep both factories in `TOKEN_FACTORY_ADDRESSES`
so tokens launched before rollback remain indexed. Never relabel old tokens as
uncapped and never remove the old factory from discovery.

No deployment, address change or traffic switch is performed by this document
or by the deployment script unless an operator explicitly broadcasts it.
