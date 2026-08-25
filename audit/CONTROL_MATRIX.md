# Privilege and rug-risk control matrix

This is an internal source review for auditor orientation, not an independent
finding disposition. Reviewers must verify every row against the pinned code.

| Area | Current control | Authority / residual risk | Preliminary classification |
|---|---|---|---|
| Token supply | Fixed 1 billion at construction; no mint entry point | No post-launch mint authority | Safe by design |
| User holdings | No max-wallet cap or freeze/blocklist in MemeToken | Concentration and Sybil activity remain market risks | Disclosed design |
| Transfer restriction | 30-block per-caller user-transfer cooldown before graduation | Curve transfers exempt; cooldown ends permanently at graduation | Controlled, review semantics |
| Token ownership | Curve owns token until atomic graduation, then renounces | Failed migration must revert renunciation and all other state | Controlled |
| Metadata | On-chain token name/symbol fixed; richer presentation is mutable off-chain | Platform can remove/change presentation, not chain history | Disclosed centralization |
| Creation fee | Timelock owner may set from 0 to 100 USDC | Public parameters can change after delay | Timelocked and capped |
| Trade fee | Compile-time 1%; 50/50 creator/protocol split | Source change and redeploy required | Immutable per curve |
| Treasury | Timelock can withdraw any token to any recipient | Safe quorum plus delay controls funds; no user-withdraw path | Timelocked custody |
| Curve excess | Timelock-owned curve can sweep post-graduation excess, excluding accrued fees | Material protocol revenue; amount depends on reserve/graduation math | Timelocked and disclosed |
| Migration | Anyone can trigger once eligible; canonical migrator performs atomic flow | Liveness is permissionless; correctness is code-dependent | Permissionless/controlled |
| LP tokens | Entire minted balance sent to `0x...dEaD` | Irrecoverable; liquidity cannot be repositioned | Irreversible by design |
| AMM | Zero-fee, non-upgradeable pair and router | Direct-pair callers face transfer-then-swap ordering risk | Disclosed design |
| Factory pause | Timelock or guardian can pause new launches; only timelock unpauses | Existing curves and AMMs remain active | Narrow emergency power |
| Upgrades | No proxy or implementation upgrade path | Changes require new deployments and application cutover | Safe by design |
| Timelock | 24-hour minimum, 30-day maximum; Safe queues/cancels | Safe quorum can eventually execute arbitrary calls to owned contracts | Explicit governance trust |
| Platform agent wallet | Off-chain KMS signer and policy controls | Disabled for mainnet until independent review; compromise can spend funded balance | Hard release gate |

## Required public disclosures

- Token holdings are uncapped; cooldown is not anti-whale or anti-Sybil protection.
- Creation fees can change within the on-chain cap after governance delay.
- Protocol receives its fee share and may sweep documented post-graduation excess.
- LP burn is permanent; the AMM charges 0%; direct pair calls are not the intended UI route.
- Off-chain metadata, messages, rankings and referrals are mutable/derived state.
- Safe/timelock and any funded agent wallet are explicit trust assumptions.
