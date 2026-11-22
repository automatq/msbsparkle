# REST API

A read-only JSON API for the company's own systems: a website, a CRM sync, accounting, reporting.
For changes as they happen, use [webhooks](WEBHOOKS.md); the objects are the same.

## Keys

Create keys in **Admin → API keys** (super admins only). A key is shown once; only a hash is
stored. Revoking a key stops it immediately. Keys can read every customer's details, so keep them
on servers: never put one in a website, browser code or a mobile app.

```bash
curl https://<your-domain>/api/v1/me -H "Authorization: Bearer sk_..."
```

## Conventions

- `GET` only. Responses are JSON: `{ "data": … }` for one object, `{ "data": [ … ], "nextCursor": … }` for lists.
- Errors: `{ "error": { "code": "…", "message": "…" } }` with `401` `unauthorized`, `404` `not_found`,
  `400` `invalid_request`, `429` `rate_limited`, `500` `internal`.
- **Rate limit:** 300 requests a minute per key. Responses carry `x-ratelimit-limit` and
  `x-ratelimit-remaining`; a `429` carries `retry-after` (seconds).
- **Pagination:** `limit` (1–100, default 50). Pass a list's `nextCursor` as `cursor` to get the
  next page; `nextCursor` is `null` on the last page.
- Amounts are integer cents. Timestamps are ISO 8601 UTC; dates (`scheduledDate`, `from`, `to`) are
  `YYYY-MM-DD` in the region's local time.

## Endpoints

| Endpoint                    | Filters                                                                           | Order               |
| --------------------------- | --------------------------------------------------------------------------------- | ------------------- |
| `GET /api/v1/me`            | (none): the company and key, to test a key                                        |                     |
| `GET /api/v1/bookings`      | `status`, `customer_id`, `created_since`, `updated_since`                         | newest first        |
| `GET /api/v1/bookings/:id`  | `:id` is the booking id or its number (e.g. `AHC-7KQ2MX`)                         |                     |
| `GET /api/v1/jobs`          | `from`, `to` (visit date), `status`, `booking_id`, `customer_id`, `updated_since` | soonest visit first |
| `GET /api/v1/jobs/:id`      |                                                                                   |                     |
| `GET /api/v1/customers`     | `email` (exact, any case), `updated_since`                                        | newest first        |
| `GET /api/v1/customers/:id` |                                                                                   |                     |
| `GET /api/v1/payments`      | `status`, `job_id`, `customer_id`, `created_since`                                | newest first        |
| `GET /api/v1/payments/:id`  |                                                                                   |                     |

A booking is the customer's plan (one-time or recurring); each visit is a **job**. Statuses:

- Booking: `PENDING`, `ACTIVE`, `PAUSED`, `CANCELLED`, `COMPLETED`
- Job: `PENDING`, `CONFIRMED`, `ASSIGNED`, `EN_ROUTE`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`, `SKIPPED`, `NO_SHOW`
- Payment: `PENDING`, `AUTHORIZED`, `REQUIRES_ACTION`, `CAPTURED`, `FAILED`, `FAILED_FINAL`, `CANCELED`, `PARTIALLY_REFUNDED`, `REFUNDED`, `DISPUTED`, `WAIVED`

## Keeping a copy in sync

Poll a list with `updated_since` set to the time of your last sync (minus a minute), page through
it, and upsert by `id`. Add webhooks for near-real-time updates and keep the poll as a safety net.

## Example: next week's visits

```bash
curl "https://<your-domain>/api/v1/jobs?from=2026-12-07&to=2026-12-13&limit=100" \
  -H "Authorization: Bearer sk_..."
```

```json
{
  "data": [
    {
      "id": "cm…",
      "bookingNumber": "AHC-7KQ2MX",
      "status": "ASSIGNED",
      "scheduledDate": "2026-12-08",
      "window": { "start": "08:00", "end": "10:00" },
      "timezone": "America/Toronto",
      "service": { "slug": "standard", "name": "Standard Cleaning" },
      "customer": {
        "id": "cm…",
        "firstName": "Ana",
        "lastName": "Silva",
        "email": "…",
        "phone": "…"
      },
      "address": { "line1": "1 Bloor St E", "city": "Toronto", "postalCode": "M4W 1A1" },
      "cleaners": [{ "id": "cm…", "firstName": "Amara", "status": "ACCEPTED" }],
      "totalCents": 15707,
      "currency": "CAD",
      "paymentStatus": "UNPAID"
    }
  ],
  "nextCursor": null
}
```
