import type { Metadata } from "next";
import { PageIntro } from "@/components/marketing/page-intro";
export const metadata: Metadata = { title: "Terms" };
export default function TermsPage() {
  return (
    <div className="mx-auto max-w-6xl px-6">
      <PageIntro title="Terms of service" />
      <div className="mt-12 max-w-2xl space-y-5 border-t border-foreground pt-8 text-lg leading-relaxed text-muted-foreground">
        <p>
          Prices shown at booking include applicable taxes and are locked 24 hours before your
          arrival window. Payment is collected from your saved card after each visit is completed.
          Tips are optional and go entirely to your cleaner.
        </p>
        <p>
          Cancellations and changes are free until 24 hours before the arrival window. Inside that
          window, or if we cannot access the home at the scheduled time, a late-cancellation fee
          applies as shown in your region at booking.
        </p>
        <p>
          All cleaners are background-checked; every visit is insured and bonded. Claims must be
          reported within 24 hours of the visit. Our happiness guarantee covers a free re-clean of
          flagged areas.
        </p>
      </div>
    </div>
  );
}
