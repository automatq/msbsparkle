import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Estimator } from "@/components/marketing/estimator";
import { buttonVariants } from "@/components/ui/button";
import {
  activeCities,
  cityBySlug,
  jsonLd,
  orgSettings,
  publicReviews,
} from "@/modules/marketing/content";
import { prisma } from "@/modules/db/client";

export const revalidate = 3600;
export const dynamicParams = true;

const PREFIX = "house-cleaning-service-";

/** Hellamaid-style URLs: /house-cleaning-service-<city>. Anything else under this segment is a 404. */
export async function generateStaticParams() {
  const cities = await activeCities();
  return cities.map((c) => ({ slug: `${PREFIX}${c.slug}` }));
}

function citySlug(slug: string): string | null {
  return slug.startsWith(PREFIX) ? slug.slice(PREFIX.length) : null;
}

export async function generateMetadata({ params }: PageProps<"/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const cs = citySlug(slug);
  const city = cs ? await cityBySlug(cs) : null;
  if (!city) return {};
  const brand = process.env.NEXT_PUBLIC_BRAND_NAME ?? "MSB Sparkle";
  const title = city.seoTitle ?? `House Cleaning Services in ${city.name} | ${brand}`;
  const description =
    city.seoDescription ??
    `Professional home cleaning in ${city.name}. Instant online pricing, background-checked cleaners, 100% happiness guarantee.`;
  return {
    title,
    description,
    alternates: { canonical: `/house-cleaning-service-${city.slug}` },
    openGraph: { title, description, type: "website" },
  };
}

export default async function CityPage({ params }: PageProps<"/[slug]">) {
  const { slug } = await params;
  const cs = citySlug(slug);
  const city = cs ? await cityBySlug(cs) : null;
  if (!city || city.region.status !== "ACTIVE") notFound();
  const [org, reviews, services] = await Promise.all([
    orgSettings(),
    publicReviews(city.regionId, 6),
    prisma.service.findMany({
      where: { active: true, organizationId: city.region.organizationId },
      orderBy: { sortOrder: "asc" },
    }),
  ]);
  const faqs = (city.faqs as { q: string; a: string }[] | null) ?? [];
  const nearby = city.region.cities.filter((c) => c.id !== city.id);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const pageUrl = `${appUrl}/house-cleaning-service-${city.slug}`;
  const ratingCount = reviews.length;
  const avg = ratingCount ? reviews.reduce((s, r) => s + r.rating, 0) / ratingCount : null;

  const ld = [
    {
      "@context": "https://schema.org",
      "@type": ["LocalBusiness", "HomeAndConstructionBusiness"],
      name: `${org.name} ${city.name}`,
      url: pageUrl,
      telephone: city.region.phone ?? org.supportPhone,
      email: city.region.email ?? org.supportEmail,
      areaServed: { "@type": "City", name: city.name },
      address: {
        "@type": "PostalAddress",
        addressLocality: city.name,
        addressRegion: city.province,
        addressCountry: "CA",
      },
      priceRange: "$$",
      ...(avg
        ? {
            aggregateRating: {
              "@type": "AggregateRating",
              ratingValue: avg.toFixed(1),
              reviewCount: ratingCount,
            },
          }
        : {}),
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: appUrl },
        { "@type": "ListItem", position: 2, name: "Locations", item: `${appUrl}/locations` },
        { "@type": "ListItem", position: 3, name: city.name, item: pageUrl },
      ],
    },
    ...(faqs.length
      ? [
          {
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: faqs.map((f) => ({
              "@type": "Question",
              name: f.q,
              acceptedAnswer: { "@type": "Answer", text: f.a },
            })),
          },
        ]
      : []),
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(ld) }} />
      <p className="text-xs text-muted-foreground">
        <Link href="/">Home</Link> / <Link href="/locations">Locations</Link> / {city.name}
      </p>
      <section className="mt-4 grid items-start gap-10 md:grid-cols-2">
        <div className="space-y-5">
          <p className="text-sm font-medium text-primary">
            Rated {org.googleRating} on Google · Background-checked cleaners · 100% happiness
            guarantee
          </p>
          <h1 className="text-4xl font-semibold tracking-tight">
            House cleaning services in {city.name}
          </h1>
          <p className="text-lg text-muted-foreground">
            {city.intro ??
              `Our ${city.name} team delivers reliable, insured house cleaning with flexible scheduling and transparent pricing.`}
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href="/book" className={buttonVariants({ size: "lg" })}>
              Book online
            </Link>
            {city.region.phone ? (
              <a
                href={`tel:${city.region.phone.replace(/\s/g, "")}`}
                className={buttonVariants({ size: "lg", variant: "outline" })}
              >
                Call {city.region.phone}
              </a>
            ) : null}
          </div>
          <ul className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
            <li>✓ Instant online price, no in-home estimate</li>
            <li>✓ No payment until the clean is done</li>
            <li>✓ Free changes up to 24 hours before</li>
            <li>✓ Arrival windows {city.region.windows.map((w) => w.label).join(", ")}</li>
          </ul>
        </div>
        <Estimator />
      </section>

      <section className="mt-16">
        <h2 className="text-2xl font-semibold">What we clean in {city.name}</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {services
            .filter((s) => s.pricingModel === "FLAT")
            .slice(0, 8)
            .map((s) => (
              <Link
                key={s.id}
                href={`/services/${s.slug}`}
                className="rounded-xl border p-4 hover:bg-muted/40"
              >
                <p className="font-medium">{s.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">{s.description}</p>
              </Link>
            ))}
        </div>
      </section>

      {city.neighborhoods.length ? (
        <section className="mt-16">
          <h2 className="text-2xl font-semibold">Neighbourhoods we serve</h2>
          <ul className="mt-3 flex flex-wrap gap-2 text-sm">
            {city.neighborhoods.map((n) => (
              <li key={n} className="rounded-full border px-3 py-1">
                {n}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {reviews.length ? (
        <section className="mt-16">
          <h2 className="text-2xl font-semibold">Recent reviews from {city.region.name}</h2>
          <ul className="mt-4 grid gap-3 md:grid-cols-3">
            {reviews.map((r) => (
              <li key={r.id} className="rounded-xl border p-4 text-sm">
                <p className="text-amber-500">{"★".repeat(r.rating)}</p>
                {r.comment ? <p className="mt-1">{r.comment}</p> : null}
                <p className="mt-2 text-xs text-muted-foreground">
                  {r.customer.firstName} {r.customer.lastName[0]}. · {r.job.service.name}
                  {r.cleaner ? ` with ${r.cleaner.firstName}` : ""}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {faqs.length ? (
        <section className="mt-16">
          <h2 className="text-2xl font-semibold">Questions about cleaning in {city.name}</h2>
          <dl className="mt-4 divide-y rounded-xl border">
            {faqs.map((f) => (
              <div key={f.q} className="p-4">
                <dt className="font-medium">{f.q}</dt>
                <dd className="mt-1 text-sm text-muted-foreground">{f.a}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      <section className="mt-16 rounded-xl border bg-muted/30 p-6 text-sm">
        <p className="font-medium">
          {org.name} {city.region.name}
        </p>
        <p className="text-muted-foreground">
          {city.region.phone ?? org.supportPhone} · {city.region.email ?? org.supportEmail}
          {city.region.addressLine ? ` · ${city.region.addressLine}` : ""}
        </p>
        {nearby.length ? (
          <p className="mt-2 text-muted-foreground">
            Also serving:{" "}
            {nearby.map((c, i) => (
              <span key={c.id}>
                {i ? ", " : ""}
                <Link href={`/house-cleaning-service-${c.slug}`} className="underline">
                  {c.name}
                </Link>
              </span>
            ))}
          </p>
        ) : null}
      </section>
    </div>
  );
}
