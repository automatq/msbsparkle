import type { Metadata } from "next";
import { ApplyForm } from "@/components/marketing/apply-form";
import { PageIntro } from "@/components/marketing/page-intro";
import { activeCities } from "@/modules/marketing/content";

export const metadata: Metadata = {
  title: "Apply",
  description: "Apply to join the cleaning team.",
};

export default async function ApplyPage() {
  const cities = await activeCities();
  return (
    <div className="mx-auto max-w-6xl px-6">
      <PageIntro title="Apply to clean with us">
        Background check required. We hire in every city we serve.
      </PageIntro>
      <div className="mt-12 max-w-2xl">
        <ApplyForm cities={cities.map((c) => c.name)} />
      </div>
    </div>
  );
}
