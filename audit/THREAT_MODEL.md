# Threat model and trust boundaries

## Protected assets

- User USDC and launched tokens.
- Curve reserves, accrued creator/protocol fees and AMM liquidity.
- Factory, Treasury, migrator and timelock authority.
- Safe owner keys, emergency guardian, deployment and KMS signer authority.
- API keys, wallet authentication challenges, profiles/messages/metadata and
  indexer integrity.

## Actors

- Honest and malicious traders, creators and token holders.
- Malicious token metadata publishers, bots, MEV/searchers and Sybil wallets.
- Compromised agent API keys or platform-funded signer credentials.
- Compromised frontend/API/indexer/RPC/cloud dependency or administrator.
- Safe owners, guardian, deployer and timelock administrator, acting honestly,
  mistakenly, collusively or after compromise.

## Boundary map

```text
User/agent wallet
  -> browser or agent API (untrusted input and displayed transaction intent)
  -> RPC providers / platform RPC proxy (availability and response integrity)
  -> Arc execution (consensus source of truth)
  -> Factory -> token + curve -> migration -> AMM pair/router
                    |                |
                    +-> Treasury <- timelock <- admin Safe

Arc logs -> indexer -> PostgreSQL/Redis -> API/WebSocket -> browser
                 (derived presentation state; never protocol authority)

Platform agent request -> API authorization + spend policy -> KMS signer
  -> allowlisted transaction builder -> Arc
```

## Primary abuse cases

- Curve/fee rounding extraction, partial-fill edge cases, reserve insolvency or
  reentrancy around USDC/token calls.
- Graduation front-running, repeated migration, donated-balance capture, pair
  substitution, LP diversion or incomplete ownership renunciation.
- AMM reserve donation/manipulation, stale quote execution, direct pair
  transfer-then-swap races and invariant bypass.
- Guardian/owner/timelock privilege escalation, operation replay, malicious
  target calldata, unsafe delay/admin rotation or compromised Safe quorum.
- Wrong-chain/wrong-contract signing, approval overreach, RPC deception,
  transaction-status confusion or mutable metadata impersonation.
- Agent API-key theft, race conditions in spend limits, arbitrary KMS signing,
  replayed authentication/tips or platform wallet balance drain.
- Indexer rollback, duplicate events, stale checkpoints, cache poisoning or API
  state presented as confirmed on-chain truth.

## Security assumptions

- Arc consensus, system USDC and published EVM behavior are correct and available.
- Safe owners use independent hardware-backed keys and preserve a 2-of-3 quorum.
- Final RPC/explorer/USDC parameters come from Circle and are independently
  verified before deployment.
- Users review wallet prompts; Orba cannot reverse confirmed transactions.
- Off-chain content, rankings and metadata are mutable and not consensus state.
