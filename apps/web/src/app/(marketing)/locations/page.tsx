import type { Metadata } from "next";
import Link from "next/link";
import { PageIntro } from "@/components/marketing/page-intro";
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
    <div className="mx-auto max-w-6xl px-6">
      <PageIntro title="Where we clean">
        {cities.length} cities across {groups.length}{" "}
        {groups.length === 1
          ? country.subdivisionLabel.toLowerCase()
          : `${country.subdivisionLabel.toLowerCase()}s`}
        . Local teams, one standard.
      </PageIntro>
      <div className="mt-14 grid gap-x-10 gap-y-14 md:grid-cols-3">
        {groups.map((g) => (
          <section key={g.p}>
            <h2 className="text-2xl font-semibold">{subdivisionName(g.p)}</h2>
            <ul className="mt-4 border-t border-foreground">
              {g.cities.map((c) => (
                <li key={c.id} className="border-b">
                  <Link
                    href={`/house-cleaning-service-${c.slug}`}
                    className="group flex items-baseline justify-between gap-3 py-3"
                  >
                    <span className="font-medium group-hover:underline group-hover:underline-offset-4">
                      {c.name}
                    </span>
                    {c.region.phone ? (
                      <span className="narrow text-sm text-muted-foreground">{c.region.phone}</span>
                    ) : null}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
