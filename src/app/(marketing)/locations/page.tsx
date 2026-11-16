import type { Metadata } from "next";
import Link from "next/link";
import { activeCities } from "@/modules/marketing/content";
import { country, subdivisionName } from "@/modules/shared/country";

export const revalidate = 3600;
export const metadata: Metadata = {
  title: "Locations",
  description: `House cleaning services across ${country.name}.`,
};

export default async function LocationsPage() {
  const cities = await activeCities();
  const groups = [...new Set(cities.map((c) => c.province))]
    .map((p) => ({ p, cities: cities.filter((c) => c.province === p) }))
    .sort((a, b) => subdivisionName(a.p).localeCompare(subdivisionName(b.p)));
  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="text-4xl font-semibold tracking-tight">Where we clean</h1>
      <p className="mt-2 text-muted-foreground">
        {cities.length} cities across {groups.length}{" "}
        {groups.length === 1
          ? country.subdivisionLabel.toLowerCase()
          : `${country.subdivisionLabel.toLowerCase()}s`}
        . Local teams, one standard.
      </p>
      <div className="mt-10 grid gap-10 md:grid-cols-3">
        {groups.map((g) => (
          <section key={g.p}>
            <h2 className="text-xl font-semibold">{subdivisionName(g.p)}</h2>
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
