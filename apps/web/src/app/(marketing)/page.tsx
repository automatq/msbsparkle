import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Estimator } from "@/components/marketing/estimator";
import { HomesBoard } from "@/components/marketing/homes-board";
import { ServiceRows } from "@/components/marketing/service-rows";
import { prisma } from "@/modules/db/client";
import { SERVICE_COPY } from "@/modules/marketing/content";
import { country, subdivisionName } from "@/modules/shared/country";

export const revalidate = 3600;

const STEPS = [
  {
    title: "Price it",
    body: "Bedrooms, bathrooms, how often. The price you see includes tax and doesn't change at the door.",
  },
  {
    title: "Pick a window",
    body: "Choose a day and a two-hour arrival window. Change it free up to 24 hours before.",
  },
  {
    title: "Pay when it's done",
    body: "Your card is saved, not charged. We charge it after the clean, and re-clean free if anything's missed.",
  },
];

export default async function HomePage() {
  const [regions, services] = await Promise.all([
    prisma.region.findMany({
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
    }),
    prisma.service.findMany({
      where: { active: true },
      orderBy: { sortOrder: "asc" },
      select: { slug: true, name: true, description: true },
    }),
  ]);
  const cityCount = regions.reduce((n, r) => n + r.cities.length, 0);
  const provinces = [...new Set(regions.map((r) => r.province))]
    .map((p) => ({
      p,
      cities: regions
        .filter((r) => r.province === p)
        .flatMap((r) => r.cities)
        .sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => subdivisionName(a.p).localeCompare(subdivisionName(b.p)));

  return (
    <div className="mx-auto max-w-6xl px-6">
      <section className="grid gap-14 pt-4 pb-24 lg:grid-cols-[1fr_1.1fr] lg:items-center">
        <div>
          <p className="text-sm font-medium">Rated 4.8 on Google · 100% happiness guarantee</p>
          <h1 className="mt-5 text-5xl font-semibold sm:text-6xl lg:text-5xl xl:text-6xl">
            House cleaning you can book in 60 seconds
          </h1>
          <p className="mt-6 max-w-md text-lg text-muted-foreground">
            Instant online pricing. Background-checked, insured cleaners. No payment until the job
            is done.
          </p>
          <Estimator className="mt-10 max-w-lg" />
        </div>
        <HomesBoard className="hidden lg:flex" />
      </section>

      <section className="pb-24">
        <h2 className="text-3xl font-semibold sm:text-4xl">
          {services.length} ways to clean, each in its colour.
        </h2>
        <p className="mt-3 max-w-xl text-muted-foreground">
          Every home is drawn as its rooms. The price follows them, so you see it before you book.
        </p>
        <div className="mt-10">
          <ServiceRows
            services={services.map((s) => ({
              slug: s.slug,
              name: s.name,
              line: SERVICE_COPY[s.slug]?.tagline ?? s.description,
            }))}
          />
        </div>
      </section>

      <section className="pb-24">
        <h2 className="max-w-4xl text-3xl font-semibold sm:text-5xl">
          {cityCount} cities. {regions.length} local teams. One way of doing it.
        </h2>
        <ol className="mt-12 grid gap-10 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.title} className="border-t border-foreground pt-5">
              <span className="wide flex size-12 items-center justify-center rounded-lg bg-foreground text-2xl font-semibold text-background">
                {i + 1}
              </span>
              <p className="wide mt-5 text-xl font-semibold">{s.title}</p>
              <p className="mt-2 text-sm text-muted-foreground">{s.body}</p>
            </li>
          ))}
        </ol>
        <Link href="/book" className={buttonVariants({ size: "lg", className: "mt-12 h-12 px-6" })}>
          Get an instant price
          <ArrowRight aria-hidden />
        </Link>
      </section>

      <section>
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <h2 className="text-3xl font-semibold sm:text-4xl">Where we clean</h2>
          <Link href="/locations" className="text-sm font-medium underline underline-offset-4">
            All locations in {country.name}
          </Link>
        </div>
        <div className="mt-10 grid gap-x-10 gap-y-12 sm:grid-cols-2 lg:grid-cols-4">
          {provinces.map((g) => (
            <section key={g.p} className="border-t border-foreground pt-4">
              <h3 className="text-lg font-semibold">{subdivisionName(g.p)}</h3>
              <ul className="mt-3 space-y-1.5 text-sm">
                {g.cities.map((c) => (
                  <li key={c.slug}>
                    <Link
                      href={`/house-cleaning-service-${c.slug}`}
                      className="text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {c.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </section>
    </div>
  );
}
