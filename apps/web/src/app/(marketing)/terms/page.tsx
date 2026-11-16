import type { Metadata } from "next";
export const metadata: Metadata = { title: "Terms" };
export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 space-y-4 text-sm text-muted-foreground">
      <h1 className="text-3xl font-semibold tracking-tight text-foreground">Terms of service</h1>
      <p>
        Prices shown at booking include applicable taxes and are locked 24 hours before your arrival
        window. Payment is collected from your saved card after each visit is completed. Tips are
        optional and go entirely to your cleaner.
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
  );
}
