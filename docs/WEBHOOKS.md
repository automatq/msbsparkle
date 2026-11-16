# Webhooks

Send bookings, visits and payments to the company's other systems (CRM, accounting, Zapier, Make,
a custom app) as they happen. Set them up in **Admin → Webhooks** (super admins only).

## Events

| Event               | When                                                                    |
| ------------------- | ----------------------------------------------------------------------- |
| `booking.created`   | A customer booked (one-time, or the first visit of a recurring plan).   |
| `booking.cancelled` | A booking was cancelled; no further visits will happen.                 |
| `job.assigned`      | A visit got its cleaner.                                                |
| `job.rescheduled`   | A visit moved to a new date or arrival window (`data.previousStartAt`). |
| `job.en_route`      | The cleaner is on the way.                                              |
| `job.started`       | The cleaner checked in.                                                 |
| `job.completed`     | The visit was completed.                                                |
| `job.cancelled`     | A visit was cancelled or skipped (`data.status` says which).            |
| `job.no_show`       | A visit was marked as a no-show.                                        |
| `payment.succeeded` | A charge succeeded.                                                     |
| `payment.failed`    | A charge failed (one event per attempt).                                |
| `payment.refunded`  | A charge was refunded, fully or partly (`data.refundedCents`).          |
| `webhook.test`      | Sent by the **Send test event** button.                                 |

An endpoint can subscribe to all events (including ones added later) or pick some.

## Request format

Each event is a `POST` with a JSON body:

```json
{
  "id": "msg_4f0c…",
  "type": "booking.created",
  "createdAt": "2026-11-17T15:04:05.000Z",
  "data": { "id": "…", "bookingNumber": "AHC-7KQ2MX", "customer": { … }, … }
}
```

`data` is a snapshot of the booking, visit (job) or charge at the time of the event. Amounts are
in cents, in `data.currency` (or the deployment's currency).

## Verifying requests

Requests follow [Standard Webhooks](https://www.standardwebhooks.com), so any of its libraries can
check them. Headers:

- `webhook-id`: the event's id. The same on every retry: use it to ignore repeats.
- `webhook-timestamp`: Unix seconds. Reject requests more than 5 minutes old.
- `webhook-signature`: `v1,<base64 HMAC-SHA256>` of `{webhook-id}.{webhook-timestamp}.{raw body}`,
  keyed with the base64-decoded part of the `whsec_…` secret.

```js
import { Webhook } from "standardwebhooks";
const wh = new Webhook(process.env.BOOKING_WEBHOOK_SECRET);
const event = wh.verify(rawBody, headers); // throws if forged or stale
```

The secret is shown once when the endpoint is created. **Rotate secret** issues a new one; the old
one stops working immediately.

## Delivery and retries

- Reply with any `2xx` within 10 seconds. Redirects are not followed.
- Anything else is retried after 1 min, 5 min, 30 min, 2 h, 6 h, 12 h and 24 h (8 attempts, about
  two days), then marked failed. **Resend** in the admin sends any delivery again.
- Events are recorded in the same database transaction as the change, so an event is never sent
  for a change that didn't happen, and isn't lost if delivery fails.
- Delivery starts right after the change. Retries need [Inngest](DEPLOY.md#4-connect-the-services-that-make-it-a-real-business),
  which every deployment needs anyway (it charges completed visits). Without it, retries happen
  only when another event is sent.
- Events can arrive more than once and out of order: compare `createdAt`, or fetch the current
  state, when order matters.
- Delivery history is kept for 30 days.

## Security

Endpoints must be public `https://` URLs. Requests are never sent to private, loopback or
link-local addresses (checked again when connecting, so DNS changes can't get around it). For
local testing only, `WEBHOOKS_ALLOW_PRIVATE=1` allows `http://` and private addresses; it is
ignored on Vercel production.
