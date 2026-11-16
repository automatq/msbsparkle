# Deploy for a new company

Each cleaning company gets its own deployment: its own Vercel project, Postgres database and photo
storage. There is no shared server and no company data in the code. Everything specific to the
company (name, regions, service areas, prices, taxes) is set in the app after deploying.

## 1. Deploy (about 5 minutes)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fautomatq%2Fmsbsparkle&root-directory=apps%2Fweb&project-name=cleaning-booking&repository-name=cleaning-booking&env=AUTH_SECRET%2CNEXT_PUBLIC_BRAND_NAME%2CNEXT_PUBLIC_COUNTRY&envDefaults=%7B%22NEXT_PUBLIC_COUNTRY%22%3A%22CA%22%7D&envDescription=AUTH_SECRET%3A%20a%20long%20random%20string%20%28openssl%20rand%20-base64%2032%29%3B%20it%20is%20also%20your%20one-time%20setup%20key.%20NEXT_PUBLIC_BRAND_NAME%3A%20your%20company%20name.%20NEXT_PUBLIC_COUNTRY%3A%20CA%20or%20US.&envLink=https%3A%2F%2Fgithub.com%2Fautomatq%2Fmsbsparkle%2Fblob%2Fmain%2Fdocs%2FDEPLOY.md&stores=%5B%7B%22type%22%3A%22integration%22%2C%22integrationSlug%22%3A%22neon%22%2C%22productSlug%22%3A%22neon%22%2C%22protocol%22%3A%22storage%22%7D%2C%7B%22type%22%3A%22blob%22%2C%22access%22%3A%22private%22%7D%5D)

The button clones this repository into your GitHub account, creates a Vercel project, and
provisions a **Neon Postgres** database and a **private Vercel Blob** store for job photos. Choose
the database region **US East (us-east-1 / Washington, D.C.)**: the app's functions run in
`iad1` (see `apps/web/vercel.json`), and every page makes several database queries.

It asks for three values:

| Variable                 | What to enter                                                                                                                                           |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AUTH_SECRET`            | A long random string: run `openssl rand -base64 32`. **Keep it**: it signs sessions, encrypts 2FA secrets, and is the one-time **setup key** in step 2. |
| `NEXT_PUBLIC_BRAND_NAME` | The company name shown on the site and in emails.                                                                                                       |
| `NEXT_PUBLIC_COUNTRY`    | `CA` or `US`. Sets postal/ZIP codes, provinces/states, currency, formatting and the default timezone.                                                   |

The first build applies the database migrations and creates the starter catalog (services,
extras, checklists and a default price sheet). Later deploys run new migrations automatically.

## 2. Finish setup in the browser

Open `https://<your-project>.vercel.app/setup` (the URL is also printed in the production logs as
`[setup] … Finish setup at …`). Enter the setup key (your `AUTH_SECRET`) and:

- the company name and the support email and phone shown to customers,
- your admin account (email and a password of 12+ characters),
- optionally the first region: name, province or state, timezone, the postal/ZIP prefixes it
  serves, and its sales tax. With at least one prefix, it takes bookings immediately.

`/setup` disappears for good once the first admin exists. Sign in at `/admin/login` and turn on
two-factor authentication at **Admin → Security**.

## 3. Configure the business in the admin

| Where                                | What                                                                                                                                                             |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Regions → New region**             | Each operating area, with its own arrival windows, capacity and cleaners.                                                                                        |
| **Region → Service areas**           | The FSAs (Canada, e.g. `M5V`) or ZIP prefixes (US, `78701` or `787`) it serves. **Requested areas** on the Regions page shows where customers asked for service. |
| **Taxes**                            | Sales tax per province or state. Add a new rate with the same name to change one.                                                                                |
| **Pricing**                          | Clone the default price sheet into a draft, edit the rates, publish.                                                                                             |
| **Cleaners**, **Promos**, **Cities** | Your team, discount codes, and public city landing pages.                                                                                                        |

## Put booking on the company's website

**Admin → Website widget** has a two-line snippet that embeds the full booking form on any site
(WordPress, Wix, Squarespace, Webflow…). It resizes itself, can be prefilled (`data-postal`,
`data-service`, `data-frequency`, …), and fires a `booking-widget:complete` event on the page for
analytics. Any site may embed it by default; set `EMBED_ALLOWED_ORIGINS` (space-separated origins,
e.g. `https://acme.com https://www.acme.com`) and redeploy to allow only the company's own site.
All other pages refuse to be framed.

## 4. Connect the services that make it a real business

Add these in **Vercel → Project → Settings → Environment Variables** (Production), then redeploy.
After each production start, the logs list anything still missing as `[config] … is not set`.

| Service                                           | Variables                                                                          | Without it                                                                                                                                                                                                                                     |
| ------------------------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Stripe](https://dashboard.stripe.com/apikeys)    | `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET` | Cards aren't saved or charged. Add a webhook to `https://<domain>/api/webhooks/stripe` for `setup_intent.succeeded`, `payment_method.detached`, `payment_intent.*`, `charge.refunded`, `charge.dispute.created`, `checkout.session.completed`. |
| [Inngest](https://vercel.com/marketplace/inngest) | `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY` (set by the Vercel integration)         | **Completed visits are never charged** and no reminders go out. Sync `https://<domain>/api/inngest`.                                                                                                                                           |
| [Resend](https://resend.com)                      | `RESEND_API_KEY`, `EMAIL_FROM` (e.g. `Acme <hello@acme.com>` on a verified domain) | No email: customer sign-in links, confirmations, receipts.                                                                                                                                                                                     |
| [Twilio](https://console.twilio.com)              | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`                    | Cleaner sign-in codes and reminders go by email instead of SMS.                                                                                                                                                                                |
| [FullCalendar](https://fullcalendar.io/pricing)   | `NEXT_PUBLIC_FULLCALENDAR_LICENSE_KEY`                                             | The dispatch board runs under a **non-commercial** license.                                                                                                                                                                                    |
| Optional                                          | `CRON_SECRET`, `NEXT_PUBLIC_GA_ID`, `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`              |                                                                                                                                                                                                                                                |

Then add the company's domain under **Settings → Domains**. Links in emails use
`NEXT_PUBLIC_APP_URL` when set, otherwise the project's production domain.

## Before taking real bookings

- Use **Vercel Pro**: the Hobby plan does not allow commercial use.
- Use a **paid Neon plan** with scale-to-zero turned off on production, so the first request after a
  quiet period isn't slow. Turn on point-in-time restore and test a restore.
- Replace the placeholder **Terms** and **Privacy** pages with the company's own.
- Run a full booking in Stripe **test mode** (book, assign, complete, charge, refund, and the 3D
  Secure card `4000 0027 6000 3184`) before switching to live keys.

## Reference

- **Country, currency, locale, timezone:** `NEXT_PUBLIC_COUNTRY`, plus optional `NEXT_PUBLIC_CURRENCY`,
  `NEXT_PUBLIC_LOCALE`, `NEXT_PUBLIC_TIMEZONE`. These are built into the site: change them only
  before launch, then redeploy.
- **Migrations on deploy:** `apps/web/scripts/deploy-db.mjs` runs `prisma migrate deploy` and the seed on
  **production** deployments only. Preview deployments skip it unless `MIGRATE_ON_PREVIEW=1`
  (use that only when each preview has its own Neon branch, so a pull request can never migrate
  the production database).
- **2FA encryption key:** derived from `AUTH_SECRET` unless `AUTH_ENCRYPTION_KEY` is set. After
  admins enrol 2FA, don't change whichever one you use.
- **Without the button:** fork the repository, import it in Vercel, add **Neon** and **Blob
  (private)** from the project's Storage tab, set the three variables above, and deploy.
