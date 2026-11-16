import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SetupForm } from "@/components/setup/setup-form";
import { isSetupPending } from "@/modules/setup/setup";
import { country, timezone } from "@/modules/shared/country";
import { brandName } from "@/modules/shared/site";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Set up", robots: { index: false } };

/** First-run setup. Disappears (404) for good once a super admin exists. */
export default async function SetupPage() {
  if (!(await isSetupPending())) notFound();
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">Set up {brandName}</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        This page is only available until the first admin account exists. It runs for {country.name}{" "}
        ({country.currency}); the country is set with{" "}
        <code className="text-xs">NEXT_PUBLIC_COUNTRY</code> when deploying.
      </p>
      <SetupForm defaultTimezone={timezone} />
    </main>
  );
}
