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

## Operations and hardening

- **Smart dispatch**: each job page ranks cleaners (preferred, history with the customer, availability, skills, conflicts, rating, daily load) with one-click assign; the dispatch board offers "Auto-assign" for a region day. Regions can switch capacity to `DERIVED` from cleaner availability.
- **Admin 2FA**: `/admin/settings/security` enrols an authenticator app; codes are then required at sign-in. Needs a 32-byte base64 `AUTH_ENCRYPTION_KEY`.
- **Rate limits** (Postgres-backed, no Redis): quotes 120/min per IP; sign-in code requests 5/15 min and code guesses 5/15 min per phone; magic links 5/15 min per email; failed admin logins 10/15 min per email. Sign-in limits are enforced inside the Auth.js providers, so they also cover direct `/api/auth/*` calls. Checkout, bookings, gift cards and public forms are limited per IP.
- **Retention**: photos are purged after 90 days (`retention` task, daily); super admins can delete a customer's personal data while keeping financial records.

## Deploying (Vercel)

1. Create a Postgres database (Neon, Supabase, …) and a **private** Vercel Blob store; link both to the project.
2. Set every variable marked `[prod]` in `.env.example`. Missing ones are logged as `[config] … is not set` when the production server starts.
3. Run migrations and the seed once against the production database:
   `pnpm db:deploy && NODE_ENV=production pnpm db:seed` (needs `SEED_ADMIN_EMAIL` and a 12+ character `SEED_ADMIN_PASSWORD`; no demo data is created).
4. Stripe: add a webhook endpoint for `https://<domain>/api/webhooks/stripe` (events: `setup_intent.succeeded`, `payment_method.detached`, `payment_intent.*`, `charge.refunded`, `charge.dispute.created`, `checkout.session.completed`).
5. Inngest: install the Vercel integration (or set the keys) and sync `https://<domain>/api/inngest`. Inngest is required: it charges completed visits and sends reminders.
6. Sign in at `/admin/login` and enrol 2FA at `/admin/settings/security`.

Job photos are stored privately and served only through `/api/uploads/…` to admins of the region, the assigned cleaners and the customer.

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
