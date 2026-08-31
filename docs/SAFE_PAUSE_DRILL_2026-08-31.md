# Arc Testnet Safe pause and recovery drill — 2026-08-31

## Status

Pause execution succeeded. The recovery operation is queued and cannot be
executed before the 48-hour timelock expires. This is Arc Testnet evidence only;
it does not authorize an Arc mainnet deployment.

## Scope

- Chain: Arc Testnet (`5042002`)
- Admin Safe: `0x33E4bd4561EE669012ff83b4eE5609122838bDcB`
- TokenFactory: `0x6CaD9423f886b1098DF47C4C6104DD83D2557eFc`
- ProtocolTimelock: `0x0DD8666e2819d36f01Dae53923b8A42ac5DA87ca`
- Existing active curve used for continuity checks:
  `0xe9860fa493fe50bd4d99121caa6aff98d3d8aada`

## Executed Safe batch

- Safe transaction hash:
  `0x0ccd9b62cce2babf8ea82f8a6602f79a58f6b79285ff043ef5c052d57b8d495e`
- On-chain transaction hash:
  `0x1be9d36047419c9afc64206fa29dd7dec9a1ae73f1055dab4c0265ec591b47e0`
- Block: `59703156`
- Executed: `2026-08-31 02:36:18 UTC` (`03:36:18 Africa/Lagos`)
- Receipt status: success
- Safe nonce: `5`, advanced to `6`
- Safe policy: two confirmations required; the Safe service records the required
  confirmations and successful execution.

The atomic batch contained exactly two calls, both with value zero:

1. `TokenFactory.pause()` with calldata `0x8456cb59`.
2. `ProtocolTimelock.queue(TokenFactory, 0, unpause(), salt)` with selector
   `0xf4559009`.

## Recovery operation

- `unpause()` calldata: `0x3f4ba83a`
- Salt:
  `0x027600bbd792fe09a06e61805fc60cf5f6c241be3736743cdc3dfe945557ff96`
- Operation ID:
  `0xafc9c075149da44377928b992cb4f8645cb2cbf902744d44af8198768ae650de`
- `readyAt`: `1788316578`
- Earliest execution: `2026-09-02 02:36:18 UTC`
  (`03:36:18 Africa/Lagos`)

Do not queue a duplicate recovery operation. Once `readyAt` has passed, call
`ProtocolTimelock.execute` with the same target, value, calldata and salt.
Execution is permissionless after the delay, but the inputs must match the
queued operation exactly.

## Post-pause verification

- `TokenFactory.paused()` returned `true`.
- A simulated `createToken(...)` call reverted with `0x68c2f226`, the selector
  for `FactoryPaused()`.
- The existing curve remained readable and returned
  `246625247898413125992619` from `quoteBuy(1_000_000)`, confirming that the
  factory pause did not disable the existing curve's quote path.
- `https://orba.fun` returned HTTP 200 after the pause.

No funded buy or sell was submitted as part of this drill. The quote check and
contract design establish continuity without spending testnet USDC.

## Monitoring result and limitation

The pause and queue events are present in the successful transaction receipt:

- `PauseStateChanged(true)` from TokenFactory.
- `OperationQueued` from ProtocolTimelock for the operation ID above.

The repository's current `MonitoringService` checks Redis, RPC health and
divergence, indexer lag, PostgreSQL pool saturation, failed funded actions and
deployer balance. It does **not** currently poll or alert on TokenFactory pause
state or Safe/timelock events. Therefore this drill proves the on-chain event
trail, but it does not prove automatic alert delivery for those two signals.
That observability gap remains open.

The attempted `api.orba.fun` health check did not resolve from the verification
host, and that hostname is not established by the repository's local public
configuration. It is not counted as evidence of API failure or success.

## Recovery checklist

After `2026-09-02 03:36:18 Africa/Lagos`:

1. Re-read `readyAt(operationId)` and confirm the value above.
2. Verify `TokenFactory.paused()` is still `true`.
3. Execute the existing timelock operation with the exact target, value,
   `unpause()` calldata and salt above. Do not queue a new operation.
4. Record the execution transaction hash, block and timestamp.
5. Verify `readyAt(operationId) == 0` and `TokenFactory.paused() == false`.
6. Repeat the `createToken(...)` simulation and confirm it no longer reverts
   with `FactoryPaused()`.
7. Repeat the existing-curve quote and public frontend checks.
8. Review the receipt for `OperationExecuted` and `PauseStateChanged(false)`.
9. Append the recovery evidence to this document before marking the drill
   complete.

## Completion state

Partial: pause and recovery scheduling are proven. The drill remains open until
the queued unpause executes and the recovery checklist passes.
