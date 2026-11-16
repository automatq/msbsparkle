# MSB Sparkle

Multi-region residential cleaning platform: public booking site, admin dispatch, cleaner portal and customer portal. Own backend (Next.js + Prisma + Postgres + Stripe), no third-party booking SaaS.

## Local development

```bash
cp apps/web/.env.example apps/web/.env   # then set AUTH_SECRET and AUTH_ENCRYPTION_KEY (openssl rand -base64 32)
docker compose up -d            # Postgres on :5432, Mailpit UI on :8025
pnpm install                    # whole workspace
pnpm db:migrate                 # apply migrations
pnpm db:seed                    # catalog + the MSB Sparkle demo company (regions, admin, demo data)
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

Reminders, price lock, automatic charging with retries, nightly series generation, cleaner alerts, review requests and the admin digest run as Inngest functions (`apps/web/src/modules/jobs`). Locally:

```bash
pnpm dev:inngest            # Inngest dev server + UI at http://localhost:8288 (keep INNGEST_DEV=1 in apps/web/.env)
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

## Mobile API (cleaner app)

`/api/mobile/v1` serves the cleaner mobile app with JSON and bearer tokens; the web portal keeps its cookie sessions. The request schemas and response types live in `packages/shared/src/mobile-api.ts` (the app imports the same file).

- Sign in: `POST auth/otp/request` `{phone}` → code by SMS (email in dev) → `POST auth/otp/verify` `{phone, code, device}` → `{accessToken, refreshToken}`.
- Send `Authorization: Bearer <accessToken>` (15 min). On 401 `UNAUTHORIZED`, call `POST auth/refresh` once and retry. Refresh tokens are single-use: replaying an old one ends the session (`SESSION_ENDED`).
- Endpoints: `me`, `jobs`, `jobs/:id`, `jobs/:id/{respond,en-route,check-in,check-out,photos}`, `jobs/:id/checklist/:itemId` (PUT), `earnings`, `availability` (GET/PUT), `time-off`, `auth/logout`.
- Suspending a cleaner revokes their app sessions immediately. Photos (`/api/uploads/…`) accept the bearer token too.

## Deploying for a company

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fautomatq%2Fmsbsparkle&root-directory=apps%2Fweb&project-name=cleaning-booking&repository-name=cleaning-booking&env=AUTH_SECRET%2CNEXT_PUBLIC_BRAND_NAME%2CNEXT_PUBLIC_COUNTRY&envDefaults=%7B%22NEXT_PUBLIC_COUNTRY%22%3A%22CA%22%7D&envDescription=AUTH_SECRET%3A%20a%20long%20random%20string%20%28openssl%20rand%20-base64%2032%29%3B%20it%20is%20also%20your%20one-time%20setup%20key.%20NEXT_PUBLIC_BRAND_NAME%3A%20your%20company%20name.%20NEXT_PUBLIC_COUNTRY%3A%20CA%20or%20US.&envLink=https%3A%2F%2Fgithub.com%2Fautomatq%2Fmsbsparkle%2Fblob%2Fmain%2Fdocs%2FDEPLOY.md&stores=%5B%7B%22type%22%3A%22integration%22%2C%22integrationSlug%22%3A%22neon%22%2C%22productSlug%22%3A%22neon%22%2C%22protocol%22%3A%22storage%22%7D%2C%7B%22type%22%3A%22blob%22%2C%22access%22%3A%22private%22%7D%5D)

One deployment per company. The button provisions Postgres (Neon) and private photo storage (Vercel Blob) and asks for `AUTH_SECRET`, the brand name and the country (`CA` or `US`). Migrations and the starter catalog run automatically on production deploys. Then open `/setup` to create the first admin and region. Full guide: [docs/DEPLOY.md](docs/DEPLOY.md).

To put booking on a company's existing website, copy the snippet from **Admin → Website widget** (`apps/web/public/embed.js`, served under `/embed/book`).

## Scripts

Run from the repo root; they run across the workspace or delegate to `apps/web` (`pnpm --filter web <script>` for anything else).

- `pnpm typecheck`, `pnpm lint`, `pnpm format`
- `pnpm test` (Vitest, every package), `pnpm e2e` (Playwright, needs `pnpm build` first)
- `pnpm db:studio` to browse data

## Layout

pnpm workspace:

- `apps/web` the Next.js app (everything below is relative to it)
- `packages/shared` (`@msb/shared`) zod schemas and types shared with the upcoming mobile app; pure TypeScript, no server-only imports

Inside `apps/web`:

- `prisma/` schema, migrations, seed
- `src/app/` route groups: `(marketing)`, `(booking)`, `(auth)`, `(admin)`, `(cleaner)`, `(customer)`, `api/`
- `src/modules/` domain code (no React): `auth`, `db`, `pricing`, `scheduling`, `bookings`, `payments`, `notifications`, `jobs`, `regions`, `shared`
- `src/components/` UI (`ui/` is shadcn)
- `src/proxy.ts` coarse role-based redirects; authoritative checks are in layouts and server actions via `getCtx()` / `requireRole()`

## Country and locale

One deployment serves one country, set with `NEXT_PUBLIC_COUNTRY` (`CA` or `US`). It drives postal/ZIP validation and labels, provinces/states, currency, number and date formatting, phone numbers, and the company timezone (override with `NEXT_PUBLIC_CURRENCY`, `NEXT_PUBLIC_LOCALE`, `NEXT_PUBLIC_TIMEZONE`). Presets live in `apps/web/src/modules/shared/country.ts`.

Service areas are postal prefixes matched most-specific-first: Canadian FSAs (`M5V`), or US ZIP5 (`90210`) / ZIP3 (`902`) prefixes. Tax rates are stored per province/state code.

## Conventions

- Money is integer cents in the deployment currency. Percentages are basis points. Use `bpsOf()`; format with `formatCents()`.
- Scheduling truth is `scheduledDate` + local window + region timezone. UTC instants are derived with `zonedToInstant()`.
- `src/modules/**` never imports from `src/app/**` or `src/components/**`.
- `packages/shared` never imports from `apps/*`, Prisma, Next.js or `server-only`.
