import type { Metadata } from "next";
import { jsonLd } from "@/modules/marketing/content";

export const metadata: Metadata = { title: "FAQ" };

export const FAQS: { q: string; a: string }[] = [
  {
    q: "How is the price calculated?",
    a: "By service type, bedrooms and bathrooms, plus any extras. You see the full price including tax before you book. Weekly plans save 20%, bi-weekly 15%, and every-4-weeks 10%.",
  },
  {
    q: "When am I charged?",
    a: "Never up front. Your card is saved securely with Stripe and charged after each clean is completed.",
  },
  {
    q: "Do I need to be home?",
    a: "No. Leave entry instructions (lockbox, concierge, key) in your account and we take care of the rest.",
  },
  {
    q: "What if I need to reschedule?",
    a: "Changes are free up to 24 hours before your arrival window. Inside 24 hours a late-change fee applies.",
  },
  {
    q: "Are cleaners background-checked and insured?",
    a: "Yes. Every cleaner passes a background check before their first job, and every clean is insured and bonded.",
  },
  {
    q: "What if I'm not happy?",
    a: "Tell us within 24 hours and we'll come back and re-clean the areas you flag, free. That's our 100% happiness guarantee.",
  },
  {
    q: "Do you bring supplies?",
    a: "Yes, cleaners bring their own supplies and equipment. Prefer specific products? Leave them out with a note.",
  },
];

export default function FaqPage() {
  const ld = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQS.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(ld) }} />
      <h1 className="text-4xl font-semibold tracking-tight">Frequently asked questions</h1>
      <dl className="mt-8 divide-y rounded-xl border">
        {FAQS.map((f) => (
          <div key={f.q} className="p-4">
            <dt className="font-medium">{f.q}</dt>
            <dd className="mt-1 text-sm text-muted-foreground">{f.a}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
