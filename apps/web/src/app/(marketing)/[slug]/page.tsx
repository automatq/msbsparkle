import type { Metadata } from "next";
import { Check, Phone } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Estimator } from "@/components/marketing/estimator";
import { QuestionList } from "@/components/marketing/question-list";
import { ServiceRows } from "@/components/marketing/service-rows";
import { buttonVariants } from "@/components/ui/button";
import {
  activeCities,
  cityBySlug,
  jsonLd,
  orgSettings,
  publicReviews,
} from "@/modules/marketing/content";
import { prisma } from "@/modules/db/client";
import { brandName, siteUrl } from "@/modules/shared/site";

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
  const brand = brandName;
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
  const appUrl = siteUrl;
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
    <div className="mx-auto max-w-6xl px-6">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(ld) }} />
      <nav aria-label="Breadcrumb" className="pt-2 text-sm text-muted-foreground">
        <Link href="/" className="hover:text-foreground">
          Home
        </Link>{" "}
        /{" "}
        <Link href="/locations" className="hover:text-foreground">
          Locations
        </Link>{" "}
        / {city.name}
      </nav>
      <section className="grid gap-14 pt-6 pb-24 lg:grid-cols-[1.1fr_1fr]">
        <div>
          <p className="text-sm font-medium">
            Rated {org.googleRating} on Google · Background-checked cleaners · 100% happiness
            guarantee
          </p>
          <h1 className="mt-5 text-5xl font-semibold sm:text-6xl lg:text-5xl xl:text-6xl">
            House cleaning services in {city.name}
          </h1>
          <p className="mt-6 max-w-lg text-lg text-muted-foreground">
            {city.intro ??
              `Our ${city.name} team delivers reliable, insured house cleaning with flexible scheduling and transparent pricing.`}
          </p>
          <ul className="mt-8 max-w-lg border-t border-foreground text-sm">
            {[
              "Instant online price, no in-home estimate",
              "No payment until the clean is done",
              "Free changes up to 24 hours before",
              `Arrival windows ${city.region.windows.map((w) => w.label).join(", ")}`,
            ].map((t) => (
              <li key={t} className="flex gap-3 border-b py-3">
                <Check className="mt-0.5 size-4 shrink-0" aria-hidden />
                {t}
              </li>
            ))}
          </ul>
          {city.region.phone ? (
            <a
              href={`tel:${city.region.phone.replace(/\s/g, "")}`}
              className={buttonVariants({
                size: "lg",
                variant: "secondary",
                className: "mt-8 h-12 px-6",
              })}
            >
              <Phone aria-hidden />
              Call {city.region.phone}
            </a>
          ) : null}
        </div>
        <div className="lg:pt-10">
          <h2 className="text-2xl font-semibold">Your price in {city.name}</h2>
          <Estimator className="mt-6" />
        </div>
      </section>

      <section className="pb-24">
        <h2 className="text-3xl font-semibold sm:text-4xl">What we clean in {city.name}</h2>
        <div className="mt-10">
          <ServiceRows
            services={services
              .filter((s) => s.pricingModel === "FLAT")
              .slice(0, 8)
              .map((s) => ({ slug: s.slug, name: s.name, line: s.description }))}
          />
        </div>
      </section>

      {city.neighborhoods.length ? (
        <section className="pb-24">
          <h2 className="text-3xl font-semibold sm:text-4xl">Neighbourhoods we serve</h2>
          <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 border-t border-foreground pt-5 text-lg">
            {city.neighborhoods.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {reviews.length ? (
        <section className="pb-24">
          <h2 className="text-3xl font-semibold sm:text-4xl">
            Recent reviews from {city.region.name}
          </h2>
          <ul className="mt-8 grid gap-x-10 md:grid-cols-3">
            {reviews.map((r) => (
              <li key={r.id} className="border-t border-foreground py-6">
                <p className="tracking-[0.2em]" aria-label={`${r.rating} out of 5`}>
                  {"★".repeat(r.rating)}
                  <span className="text-muted-foreground/40">{"★".repeat(5 - r.rating)}</span>
                </p>
                {r.comment ? <p className="mt-3">{r.comment}</p> : null}
                <p className="mt-3 text-sm text-muted-foreground">
                  {r.customer.firstName} {r.customer.lastName[0]}. · {r.job.service.name}
                  {r.cleaner ? ` with ${r.cleaner.firstName}` : ""}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {faqs.length ? (
        <section className="pb-24">
          <h2 className="text-3xl font-semibold sm:text-4xl">
            Questions about cleaning in {city.name}
          </h2>
          <QuestionList items={faqs} className="mt-8" />
        </section>
      ) : null}

      <section className="border-t border-foreground pt-6">
        <p className="wide text-xl font-semibold">
          {org.name} {city.region.name}
        </p>
        <p className="mt-1 text-muted-foreground">
          {city.region.phone ?? org.supportPhone} · {city.region.email ?? org.supportEmail}
          {city.region.addressLine ? ` · ${city.region.addressLine}` : ""}
        </p>
        {nearby.length ? (
          <p className="mt-3 text-muted-foreground">
            Also serving:{" "}
            {nearby.map((c, i) => (
              <span key={c.id}>
                {i ? ", " : ""}
                <Link
                  href={`/house-cleaning-service-${c.slug}`}
                  className="text-foreground underline underline-offset-4"
                >
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
