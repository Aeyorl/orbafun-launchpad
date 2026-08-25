# Protocol invariants

Auditors should attempt to falsify every property below across direct calls,
adversarial ordering, donated balances, rounding boundaries and privileged
operations.

## Token and curve

- Each launch creates one fixed-supply token and one curve; supply cannot grow.
- Holdings are uncapped. Before graduation, the only token transfer restriction
  is the documented per-caller cooldown on user-to-user transfers.
- A buy or sell never returns less than the caller's submitted minimum output.
- Curve reserve and `tokensSold` changes match the executed trade after rounding.
- Gross trade value equals curve reserve movement plus the documented fee; fee
  shares sum exactly to the total fee.
- Creator fees are claimable only by the creator. Protocol fees are claimable
  only by the configured protocol owner and go to Treasury.
- A failed transfer, migration or external call reverts all associated state.

## Graduation and AMM

- A token graduates at most once and has one factory-canonical AMM pair.
- Migration uses only balances received for that migration; unrelated donated
  balances remain untouched.
- Pair creation, reserve transfer, liquidity mint, LP burn, curve closure,
  factory status and token renunciation are atomic.
- All minted LP tokens go irrecoverably to `0x...dEaD`.
- After graduation, bonding-curve trading is closed, token ownership is zero and
  the transfer cooldown is disabled.
- Router swaps accept only factory-canonical token/USDC pairs and enforce input,
  recipient, deadline and minimum output.
- Every successful AMM swap preserves or increases the constant-product
  invariant subject only to integer rounding. The AMM charges zero protocol fee.

## Administration and operations

- Treasury withdrawals and protocol reconfiguration require an elapsed,
  uniquely identified timelock operation.
- The guardian can pause new launches immediately but cannot unpause, withdraw,
  change fees, replace protocol contracts or bypass the timelock.
- Mainnet API processes never load a raw deployer private key.
- A runtime signer cannot exceed configured action/daily/monthly/balance limits
  and cannot sign arbitrary transactions outside its allowlisted actions.
- Indexer/database/cache state never grants on-chain authority and cannot cause
  the UI to sign for a different chain, contract or amount than displayed.
