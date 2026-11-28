import type { Metadata } from "next";
import { PageIntro } from "@/components/marketing/page-intro";

export const metadata: Metadata = { title: "100% Happiness Guarantee" };

const STEPS = [
  "Reply to your receipt email or rate the visit in your account with what we missed.",
  "We schedule a re-clean of the flagged areas within 48 hours.",
  "Still not happy? We refund the affected portion of the clean.",
];

export default function GuaranteePage() {
  return (
    <div className="mx-auto max-w-6xl px-6">
      <PageIntro title="100% happiness guarantee">
        If anything about your clean isn&apos;t right, tell us within 24 hours and we&apos;ll send a
        cleaner back to fix it at no charge.
      </PageIntro>
      <ol className="mt-14 grid gap-10 md:grid-cols-3">
        {STEPS.map((s, i) => (
          <li key={s} className="border-t border-foreground pt-5">
            <span className="wide flex size-12 items-center justify-center rounded-lg bg-foreground text-2xl font-semibold text-background">
              {i + 1}
            </span>
            <p className="mt-5 text-lg">{s}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}
