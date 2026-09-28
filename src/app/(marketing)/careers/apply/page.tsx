import type { Metadata } from "next";
import { ApplyForm } from "@/components/marketing/apply-form";
import { activeCities } from "@/modules/marketing/content";

export const metadata: Metadata = {
  title: "Apply",
  description: "Apply to join the cleaning team.",
};

export default async function ApplyPage() {
  const cities = await activeCities();
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">Apply to clean with us</h1>
      <p className="mt-2 text-muted-foreground">
        Background check required. We hire in every city we serve.
      </p>
      <div className="mt-8">
        <ApplyForm cities={cities.map((c) => c.name)} />
      </div>
    </div>
  );
}
