import type { Metadata } from "next";
import Link from "next/link";
import { activeCities } from "@/modules/marketing/content";

export const revalidate = 3600;
export const metadata: Metadata = {
  title: "Locations",
  description: "House cleaning services across Ontario, Alberta and British Columbia.",
};

const PROVINCE: Record<string, string> = { ON: "Ontario", AB: "Alberta", BC: "British Columbia" };

export default async function LocationsPage() {
  const cities = await activeCities();
  const groups = ["ON", "AB", "BC"]
    .map((p) => ({ p, cities: cities.filter((c) => c.province === p) }))
    .filter((g) => g.cities.length);
  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="text-4xl font-semibold tracking-tight">Where we clean</h1>
      <p className="mt-2 text-muted-foreground">
        {cities.length} cities across {groups.length} provinces. Local teams, one standard.
      </p>
      <div className="mt-10 grid gap-10 md:grid-cols-3">
        {groups.map((g) => (
          <section key={g.p}>
            <h2 className="text-xl font-semibold">{PROVINCE[g.p]}</h2>
            <ul className="mt-3 space-y-1 text-sm">
              {g.cities.map((c) => (
                <li key={c.id}>
                  <Link href={`/house-cleaning-service-${c.slug}`} className="hover:underline">
                    {c.name}
                  </Link>
                  {c.region.phone ? (
                    <span className="ml-2 text-xs text-muted-foreground">{c.region.phone}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
