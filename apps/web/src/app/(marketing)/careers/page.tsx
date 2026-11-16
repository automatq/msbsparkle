import type { Metadata } from "next";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Careers",
  description: "Join our cleaning team. Living wage, flexible schedule, paid weekly.",
};

export default function CareersPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <h1 className="text-4xl font-semibold tracking-tight">Clean with us</h1>
      <p className="mt-2 text-lg text-muted-foreground">
        Set your own availability, get paid for every job you complete, and keep 100% of your tips.
      </p>
      <ul className="mt-8 grid gap-3 text-sm sm:grid-cols-3">
        <li className="rounded-xl border p-4">
          <p className="font-medium">Living wage</p>
          <p className="text-muted-foreground">
            Percentage of every job or an hourly rate, your choice, plus tips.
          </p>
        </li>
        <li className="rounded-xl border p-4">
          <p className="font-medium">Your schedule</p>
          <p className="text-muted-foreground">
            Pick the days you work. Accept or decline offers from your phone.
          </p>
        </li>
        <li className="rounded-xl border p-4">
          <p className="font-medium">Support</p>
          <p className="text-muted-foreground">
            Supplies guidance, a dispatcher who answers, and customers who rate you.
          </p>
        </li>
      </ul>
      <div className="mt-10">
        <Link href="/careers/apply" className={buttonVariants({ size: "lg" })}>
          Apply in 2 minutes
        </Link>
      </div>
    </div>
  );
}
