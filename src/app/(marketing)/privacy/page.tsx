import type { Metadata } from "next";
export const metadata: Metadata = { title: "Privacy" };
export default function PrivacyPage() {
  const brand = process.env.NEXT_PUBLIC_BRAND_NAME ?? "MSB Sparkle";
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 space-y-4 text-sm text-muted-foreground">
      <h1 className="text-3xl font-semibold tracking-tight text-foreground">Privacy policy</h1>
      <p>
        {brand} collects the information needed to schedule and deliver cleaning services: your
        name, contact details, service address, access notes, and payment card details held by
        Stripe. We never store full card numbers.
      </p>
      <p>
        We use your details to confirm bookings, send reminders, process payment after service, and
        respond to support requests. Marketing email is sent only with your consent and you can
        withdraw it in your account settings or via the unsubscribe link. Text messages stop when
        you reply STOP.
      </p>
      <p>
        Cleaners see only the address, access notes, and first name needed for the visit.
        Before-and-after photos are retained for 90 days for quality assurance. To access or delete
        your data, contact support; we anonymize customer records on request while retaining
        financial records as required by law (PIPEDA).
      </p>
    </div>
  );
}
