import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Estimator } from "@/components/marketing/estimator";
import { prisma } from "@/modules/db/client";

export const revalidate = 3600;

export default async function HomePage() {
  const regions = await prisma.region.findMany({
    where: { status: "ACTIVE" },
    orderBy: { name: "asc" },
    select: {
      slug: true,
      name: true,
      province: true,
      cities: {
        where: { active: true },
        orderBy: { name: "asc" },
        select: { slug: true, name: true },
      },
    },
  });
  const cityCount = regions.reduce((n, r) => n + r.cities.length, 0);

  return (
    <div className="mx-auto max-w-6xl px-4 py-16">
      <section className="grid items-center gap-10 md:grid-cols-2">
        <div className="space-y-6">
          <p className="text-sm font-medium text-primary">
            Rated 4.8 on Google · 100% happiness guarantee
          </p>
          <h1 className="text-4xl font-semibold tracking-tight md:text-5xl">
            House cleaning you can book in 60 seconds
          </h1>
          <p className="text-lg text-muted-foreground">
            Instant online pricing. Background-checked, insured cleaners. No payment until the job
            is done.
          </p>
          <div className="flex gap-3">
            <Link href="/book" className={buttonVariants({ size: "lg" })}>
              Get an instant price
            </Link>
            <Link href="/locations" className={buttonVariants({ variant: "outline", size: "lg" })}>
              See locations
            </Link>
          </div>
        </div>
        <Estimator />
      </section>

      <section className="mt-20">
        <h2 className="text-2xl font-semibold">
          Serving {cityCount} cities across {regions.length} regions in Canada
        </h2>
        <ul className="mt-4 flex flex-wrap gap-2 text-sm">
          {regions.flatMap((r) =>
            r.cities.map((c) => (
              <li key={c.slug}>
                <Link
                  href={`/house-cleaning-service-${c.slug}`}
                  className="inline-block rounded-full border px-3 py-1 hover:bg-muted/40"
                >
                  {c.name}, {r.province}
                </Link>
              </li>
            )),
          )}
        </ul>
        <p className="mt-3 text-sm">
          <Link href="/locations" className="underline">
            All locations
          </Link>{" "}
          ·{" "}
          <Link href="/services" className="underline">
            All services
          </Link>
        </p>
      </section>
    </div>
  );
}
