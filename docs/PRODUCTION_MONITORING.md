# Orba production monitoring

The API runs dependency and operational checks every minute when
`MONITORING_ENABLED=true`. Alerts are edge-triggered and deduplicated; a second
notification is sent when the condition recovers.

## Covered signals

- PostgreSQL pool saturation and query availability
- Upstash Redis connectivity and configurable key-count capacity
- healthy Arc RPC provider count and provider block-height divergence
- Arc event-indexer block/clock lag
- released platform spend reservations, which indicate failed funded actions
- managed deployer operating balance
- external API readiness and frontend availability every five minutes through
  `.github/workflows/production-monitor.yml`

## Alert delivery

Set `ALERT_WEBHOOK_URL` to an HTTPS incident webhook. Optional bearer
authentication uses `ALERT_WEBHOOK_BEARER_TOKEN`. Without a webhook, detailed
alerts remain visible in Render logs; the independent GitHub monitor opens and
updates a repository issue if the public stack becomes unavailable.

## Upstash provider limits

Set `REDIS_KEY_WARN_COUNT` below the database's key/storage operating limit.
For pay-as-you-go databases, also configure an Upstash monthly budget so Upstash
sends its native 70% and 90% email notifications:

```text
upstash redis update-budget --db-id <database-id> --budget <cents>
```

This provider-side budget requires an Upstash Developer API login and should be
chosen by the account owner because exceeding it rate-limits the database.
Set `UPSTASH_ALERTS_CONFIGURED=true` in the mainnet environment only after the
budget and notification recipients have been verified in the Upstash console.
