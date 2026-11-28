import type { Metadata } from "next";
import { PageIntro } from "@/components/marketing/page-intro";
import { brandName } from "@/modules/shared/site";
export const metadata: Metadata = { title: "Privacy" };
export default function PrivacyPage() {
  const brand = brandName;
  return (
    <div className="mx-auto max-w-6xl px-6">
      <PageIntro title="Privacy policy" />
      <div className="mt-12 max-w-2xl space-y-5 border-t border-foreground pt-8 text-lg leading-relaxed text-muted-foreground">
        <p>
          {brand} collects the information needed to schedule and deliver cleaning services: your
          name, contact details, service address, access notes, and payment card details held by
          Stripe. We never store full card numbers.
        </p>
        <p>
          We use your details to confirm bookings, send reminders, process payment after service,
          and respond to support requests. Marketing email is sent only with your consent and you
          can withdraw it in your account settings or via the unsubscribe link. Text messages stop
          when you reply STOP.
        </p>
        <p>
          Cleaners see only the address, access notes, and first name needed for the visit.
          Before-and-after photos are retained for 90 days for quality assurance. To access or
          delete your data, contact support; we anonymize customer records on request while
          retaining financial records as required by law (PIPEDA).
        </p>
      </div>
    </div>
  );
}
