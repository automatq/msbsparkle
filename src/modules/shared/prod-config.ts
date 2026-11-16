/**
 * Settings the app can run without in development but that production needs. Missing ones are
 * reported at server start (see src/instrumentation.ts) rather than failing the build, so CI and
 * preview deployments still work.
 */
const REQUIRED_IN_PRODUCTION: { name: string; why: string }[] = [
  { name: "STRIPE_SECRET_KEY", why: "cards are not saved or charged" },
  {
    name: "STRIPE_WEBHOOK_SECRET",
    why: "Stripe events (refunds, disputes, gift cards) are ignored",
  },
  { name: "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", why: "the card form cannot load" },
  { name: "INNGEST_EVENT_KEY", why: "completed visits are never charged and no reminders go out" },
  { name: "INNGEST_SIGNING_KEY", why: "Inngest cannot call /api/inngest" },
  { name: "BLOB_READ_WRITE_TOKEN", why: "cleaners cannot upload job photos" },
  { name: "RESEND_API_KEY", why: "no emails are sent (sign-in links, confirmations, receipts)" },
  { name: "CRON_SECRET", why: "the /api/internal/tasks fallback cannot be called" },
  {
    name: "NEXT_PUBLIC_FULLCALENDAR_LICENSE_KEY",
    why: "the dispatch board runs under a non-commercial license",
  },
];

const RECOMMENDED: { name: string; why: string }[] = [
  {
    name: "TWILIO_ACCOUNT_SID",
    why: "cleaner sign-in codes and reminders go by email instead of SMS",
  },
];

export function missingProductionConfig(env: Record<string, string | undefined> = process.env) {
  const blank = (n: string) => !env[n]?.trim();
  return {
    required: REQUIRED_IN_PRODUCTION.filter((v) => blank(v.name)),
    recommended: RECOMMENDED.filter((v) => blank(v.name)),
  };
}
