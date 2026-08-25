# Smart-contract external-call inventory

Reviewers should verify checks-effects-interactions ordering, return-data
handling, reentrancy exposure and rollback behavior at every call site.

| Caller | External target / operation | Trust and handling |
|---|---|---|
| TokenFactory | Arc USDC `transferFrom` for creation fee | Low-level call accepts empty or `true` return; launch reverts on failure |
| TokenFactory | Deploy BondingCurve and MemeToken; call curve setters | Newly created known code; factory-only one-time initialization |
| BondingCurve | Arc USDC `transferFrom`/`transfer` | SafeUSDC handles non-standard return; buy/sell/claims are nonReentrant |
| BondingCurve | MemeToken transfer/transferFrom | Known factory-created token; explicit bool required |
| BondingCurve | MemeToken `graduate` and factory `markGraduated` | Canonical token/factory; migration-only graduation; transaction is atomic |
| BondingCurve | LiquidityMigration `checkAndMigrate` | Canonical migrator configured before trading; called during threshold buy |
| LiquidityMigration | Factory/curve/token/USDC balance reads | Canonical factory record determines curve; before/after deltas isolate balances |
| LiquidityMigration | AMMFactory `createPair` and curve `graduateToAmm` | Canonical factory/curve; state reverts atomically on any failure |
| LiquidityMigration | Token/USDC transfers, AMMPair mint and LP transfer | Known launched token/canonical pair; explicit returns; LP sent to burn address |
| AMMRouter | USDC or launched-token `transferFrom`; AMMPair `swap` | Reentrancy guard; canonical pair validation; deadline/slippage checks |
| AMMPair | token balance reads and output transfer | Pair lock prevents reentry; invariant checked after output transfer |
| Treasury | USDC transfer or arbitrary ERC-20 transfer | Owner-only through timelock; low-level token call accepts empty or `true` |
| ProtocolTimelock | Arbitrary target `call{value}` | Permissionless execution only for queued, elapsed exact operation; reentry guard; revert bytes wrapped |

## Highest-value review points

- Arc system USDC behavior and whether accepting empty return data is correct for
  every production operation.
- BondingCurve's automatic migration call during a threshold-crossing buy.
- State deletion/execution ordering and arbitrary target behavior in timelock.
- AMMPair output-before-invariant-check flow and balance donations.
- Malicious or non-standard token behavior at generic Treasury and AMM pair
  boundaries, even though Orba-launched tokens use known MemeToken bytecode.
