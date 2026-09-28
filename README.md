# MSB Sparkle

Multi-region residential cleaning platform: public booking site, admin dispatch, cleaner portal and customer portal. Own backend (Next.js + Prisma + Postgres + Stripe), no third-party booking SaaS.

## Local development

```bash
cp .env.example .env            # then set AUTH_SECRET and AUTH_ENCRYPTION_KEY (openssl rand -base64 32)
docker compose up -d            # Postgres on :5432, Mailpit UI on :8025
pnpm install
pnpm db:migrate                 # apply migrations
pnpm db:seed                    # regions, pricing, admin user, demo data
pnpm dev                        # http://localhost:3000
```

Seeded logins (dev):

| Role         | How to sign in                                                               |
| ------------ | ---------------------------------------------------------------------------- |
| Super admin  | `/admin/login` · admin@msbsparkle.local / admin12345!                        |
| Region admin | `/admin/login` · calgary.admin@msbsparkle.local / admin12345! (Calgary only) |
| Cleaner      | `/login/phone` · mobile 416 555 1000 (Amara) … 1004; code arrives in Mailpit |
| Customer     | `/login` · any email you booked with; magic link arrives in Mailpit          |

Mailpit inbox: http://localhost:8025. Without Twilio, cleaner sign-in codes are emailed instead of texted.

## Background jobs (Inngest)

Reminders, price lock, automatic charging with retries, nightly series generation, cleaner alerts, review requests and the admin digest run as Inngest functions (`src/modules/jobs`). Locally:

```bash
pnpm dev:inngest            # Inngest dev server + UI at http://localhost:8288 (keep INNGEST_DEV=1 in .env)
```

Every task is also callable without Inngest for testing or as a Vercel Cron fallback:

```bash
curl -X POST localhost:3000/api/internal/tasks -H "authorization: Bearer $CRON_SECRET" \
  -H 'content-type: application/json' -d '{"task":"reminders"}'   # reminders | cutoff | series | retries | digest | charge | review
```

## Scripts

- `pnpm typecheck`, `pnpm lint`, `pnpm format`
- `pnpm test` (Vitest unit), `pnpm e2e` (Playwright, needs `pnpm build` first)
- `pnpm db:studio` to browse data

## Layout

- `prisma/` schema, migrations, seed
- `src/app/` route groups: `(marketing)`, `(booking)`, `(auth)`, `(admin)`, `(cleaner)`, `(customer)`, `api/`
- `src/modules/` domain code (no React): `auth`, `db`, `pricing`, `scheduling`, `bookings`, `payments`, `notifications`, `jobs`, `regions`, `shared`
- `src/components/` UI (`ui/` is shadcn)
- `src/proxy.ts` coarse role-based redirects; authoritative checks are in layouts and server actions via `getCtx()` / `requireRole()`

## Conventions

- Money is integer cents. Percentages are basis points. Use `bpsOf()`.
- Scheduling truth is `scheduledDate` + local window + region timezone. UTC instants are derived with `zonedToInstant()`.
- `src/modules/**` never imports from `src/app/**` or `src/components/**`.
