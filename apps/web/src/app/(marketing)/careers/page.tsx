import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { PageIntro } from "@/components/marketing/page-intro";
import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Careers",
  description: "Join our cleaning team. Living wage, flexible schedule, paid weekly.",
};

const POINTS = [
  {
    title: "Living wage",
    body: "Percentage of every job or an hourly rate, your choice, plus tips.",
  },
  {
    title: "Your schedule",
    body: "Pick the days you work. Accept or decline offers from your phone.",
  },
  {
    title: "Support",
    body: "Supplies guidance, a dispatcher who answers, and customers who rate you.",
  },
];

export default function CareersPage() {
  return (
    <div className="mx-auto max-w-6xl px-6">
      <PageIntro title="Clean with us">
        Set your own availability, get paid for every job you complete, and keep 100% of your tips.
      </PageIntro>
      <ul className="mt-14 grid gap-10 md:grid-cols-3">
        {POINTS.map((p) => (
          <li key={p.title} className="border-t border-foreground pt-5">
            <p className="wide text-xl font-semibold">{p.title}</p>
            <p className="mt-2 text-muted-foreground">{p.body}</p>
          </li>
        ))}
      </ul>
      <Link
        href="/careers/apply"
        className={buttonVariants({ size: "lg", className: "mt-12 h-12 px-6" })}
      >
        Apply in 2 minutes
        <ArrowRight aria-hidden />
      </Link>
    </div>
  );
}
