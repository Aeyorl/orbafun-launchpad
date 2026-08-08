# Protocol invariants

- The token supply cannot increase after construction.
- A token can have exactly one bonding curve and one canonical post-graduation
  AMM pair.
- A user never receives less than their submitted minimum output.
- Gross USDC equals net curve reserve plus creator and protocol fees, subject
  only to documented integer rounding.
- Creator fees cannot be claimed by another address; protocol fees can only go
  to the configured treasury.
- Unrelated balances donated to the migration contract are never included in a
  token's migration.
- Graduation is atomic: pair creation, reserve transfer, liquidity mint, LP
  burn, curve closure and token renunciation either all occur or all revert.
- All minted LP tokens are irrecoverably sent to `0x...dEaD`.
- After graduation, token ownership is zero and bonding-curve trading is closed.
- Router swaps only use factory-canonical token/USDC pairs and respect deadline
  and minimum output.
- Treasury withdrawals and protocol reconfiguration require a queued timelock
  operation whose delay has elapsed.
- The emergency guardian can pause new launches immediately but cannot unpause,
  withdraw, change fees, replace contracts or alter the timelock.
- Mainnet API processes never load a raw deployer private key.
