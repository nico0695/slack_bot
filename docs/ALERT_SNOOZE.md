# Alert snooze (V3)

Snooze presets shared by Slack and `POST /alerts/:id/snooze`, the endpoint the bridge calls when the user snoozes a notice on the ESP32. Request and responses: [API_REFERENCE.md](API_REFERENCE.md#post-alertsidsnooze).

## Presets

Defined once in `src/modules/alerts/shared/constants/snoozeCatalog.ts` and resolved on the server from the server clock (`now`) and the alert's current date (`scheduledAt`):

| Key | Slack label | Rule |
|-----|-------------|------|
| `snooze_5m` | Snooze 5 min | `max(now, scheduledAt) + 5 min` |
| `snooze_1h` | Snooze 1 hora | `max(now, scheduledAt) + 1 h` |
| `snooze_tomorrow_same_time` | Same time tomorrow | Day after `now` in `America/Argentina/Buenos_Aires`, at the local hour and minute of `scheduledAt`, seconds and ms set to 0 |
| `snooze_tomorrow` (hidden) | — | Day after `max(now, scheduledAt)` at 09:00 Argentina |

- `snooze_tomorrow_same_time` always lands tomorrow, also for old notices and for future alerts: an alert due in five days moves earlier, to tomorrow.
- `snooze_tomorrow` is not shown in any menu and is not accepted by REST. It stays because the `snooze #id mañana` text command uses it, so typed or spoken "mañana" still means 09:00 while the button means the same time.
- Single-alert menus show the three visible presets plus resolve and delete (Slack's 5-option cap). Listing rows keep `Ver Detalles`, 5 min and 1 hour.
- Snoozing never changes the user's default snooze preference.

## Atomic update

`AlertsServices.snoozeAlertByPreset` computes the target from the expected date and applies it in one conditional statement:

```sql
UPDATE alerts SET date = :target, sent = false
WHERE id = :id AND userId = :userId AND date = :expected AND deletedAt IS NULL
```

No transaction: on the shared SQLite connection a failed transaction rolls back concurrent writes (see [BRIDGE_INTEGRATION.md](BRIDGE_INTEGRATION.md) §10). When no row changes, a read tells `not_found` (missing or another user's) from `schedule_changed`. Database failures are thrown, so REST answers `500` (unconfirmed) and never a rejection status for them.

Dates are compared as instants at the stored millisecond precision.

Slack buttons use the same operation with the date just read as the expected one: old messages carry no date, but a change made between that read and the update is not overwritten (the user sees `This alert changed. Try again.`). Minute amounts (`snooze #id 30m`, default preference) and `mañana HH:mm` keep the previous reschedule path.

## Cron transition

`alertCronJob` marks each processed alert as notified only while it still has the date it read (`WHERE id AND date AND sent = false`). Before, it marked by id, so an alert snoozed while the cron was posting it was set to `sent = true` and never fired again.

## Decisions and known limits

- A disabled user gets `401`, the existing `@HttpAuth` behavior (also in [ASSISTANT_REST.md](ASSISTANT_REST.md)), not the `403` of the first contract draft.
- snake_case body and response follow the bridge contract: an exception to the bot's camelCase REST convention, like the assistant endpoint.
- Snoozing a resolved alert reactivates it: `sent` still means both notified and resolved.
- One execution per request: no retries, no request ledger, no exactly-once guarantee. A `500` or a lost response may hide an applied snooze.
- Notices already queued for the bridge are not cancelled; a later snooze with their old date gets `409`.

## Tests

- Preset rules with a fixed clock: `alertInteractions.services.test.ts`.
- Atomic update, ownership, stale date, concurrent snoozes and the cron transition on in-memory SQLite: `alerts.snooze.test.ts`.
- Endpoint through the real auth decorators and error handler: `alertsWeb.snooze.integration.test.ts`.
- Slack menus and delegation: `slackMessages.utils.test.ts`, `slackMessages.catalogExtensibility.test.ts`.

Unit and integration tests run locally; they do not cover deployment or the ESP32.
