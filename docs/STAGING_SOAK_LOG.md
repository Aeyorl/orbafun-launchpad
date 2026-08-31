# Seven-day staging soak log

Use this log against one immutable release commit and one dedicated staging
environment. Restart the seven-day count after any contract, API, indexer,
database-schema or release-configuration change.

## Run identity

- Release commit:
- Candidate tag:
- Start time (UTC):
- End time (UTC):
- Operators:
- Staging frontend:
- Staging API:
- Arc chain ID: `5042002`
- Contract deployment manifest:

## Daily evidence

| Day | Date/time UTC | Launch | Buy | Sell | Receipt/finality | Indexer lag | Redis | Database | RPC providers/divergence | Alerts | Frontend/API | Operator |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | | | | | | | | | | | | |
| 2 | | | | | | | | | | | | |
| 3 | | | | | | | | | | | | |
| 4 | | | | | | | | | | | | |
| 5 | | | | | | | | | | | | |
| 6 | | | | | | | | | | | | |
| 7 | | | | | | | | | | | | |

For each transaction, record a transaction hash and the expected indexed state.
For each health signal, attach a provider screenshot, alert identifier, log
query or timestamped command output. A bare "pass" is insufficient evidence.

## Required controlled-failure checks

- [ ] One RPC provider is removed or made unavailable; reads continue through
      an independent provider and the degradation is observable.
- [ ] Redis is unavailable; the documented degraded-mode behavior occurs and
      recovery is verified.
- [ ] Indexer lag crosses the warning threshold; the alert fires once and
      resolves once caught up.
- [ ] A failed receipt is detected without recording a successful trade.
- [ ] Preview and production/staging secrets remain separated.
- [ ] A second operator reviews the exact release commit and deployment result.

Do not pause the shared factory merely to satisfy this soak log. Use the
separate Safe pause drill evidence for guardian and timelock validation.

## Exit criteria

- Seven consecutive days against the same immutable release commit.
- Daily launch, buy and sell evidence is complete.
- No unexplained data divergence or unresolved critical alert.
- Controlled-failure tests passed with recovery evidence.
- A second operator signed the result.
- Any defect found during the soak is resolved in a new candidate, which starts
  a new seven-day window.

## Result

Status: not started.

This log is staging evidence only and does not replace the independent contract
audit, official Arc parameters, deployment bytecode verification or production
canary required by the mainnet runbook.
