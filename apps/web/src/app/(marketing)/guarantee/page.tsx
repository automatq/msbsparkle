import type { Metadata } from "next";
export const metadata: Metadata = { title: "100% Happiness Guarantee" };
export default function GuaranteePage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 space-y-4">
      <h1 className="text-4xl font-semibold tracking-tight">100% happiness guarantee</h1>
      <p className="text-lg text-muted-foreground">
        If anything about your clean isn&apos;t right, tell us within 24 hours and we&apos;ll send a
        cleaner back to fix it at no charge.
      </p>
      <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
        <li>Reply to your receipt email or rate the visit in your account with what we missed.</li>
        <li>We schedule a re-clean of the flagged areas within 48 hours.</li>
        <li>Still not happy? We refund the affected portion of the clean.</li>
      </ol>
    </div>
  );
}
