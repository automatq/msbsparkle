import type { Metadata } from "next";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import { RoomStrip, homeBlocks } from "@/components/marketing/room-strip";
import { prisma } from "@/modules/db/client";
import { SERVICE_COPY, jsonLd } from "@/modules/marketing/content";
import { sampleHome, serviceHue } from "@/modules/marketing/hues";
import { currency } from "@/modules/shared/country";
import { brandName } from "@/modules/shared/site";

export const revalidate = 3600;

export async function generateStaticParams() {
  return (await prisma.service.findMany({ where: { active: true }, select: { slug: true } })).map(
    (s) => ({ slug: s.slug }),
  );
}

export async function generateMetadata({
  params,
}: PageProps<"/services/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const s = await prisma.service.findFirst({ where: { slug, active: true } });
  if (!s) return {};
  return {
    title: s.name,
    description: s.description ?? undefined,
    alternates: { canonical: `/services/${slug}` },
  };
}

export default async function ServicePage({ params }: PageProps<"/services/[slug]">) {
  const { slug } = await params;
  const s = await prisma.service.findFirst({ where: { slug, active: true } });
  if (!s) notFound();
  const copy = SERVICE_COPY[s.slug];
  const brand = brandName;
  const hue = serviceHue(s.slug);
  const ld = {
    "@context": "https://schema.org",
    "@type": "Service",
    name: s.name,
    description: s.description,
    provider: { "@type": "Organization", name: brand },
    areaServed: "CA",
    offers: {
      "@type": "Offer",
      priceCurrency: currency,
      availability: "https://schema.org/InStock",
    },
  };
  return (
    <div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(ld) }} />
      {/* The service in its colour, the way a printed page would open. */}
      <section data-hue={hue} className="bg-hue text-hue-ink">
        <div className="mx-auto flex min-h-[26rem] max-w-6xl flex-col justify-between gap-12 px-6 py-10">
          <Link
            href="/services"
            className="inline-flex w-fit items-center gap-1.5 text-sm font-medium opacity-80 hover:opacity-100"
          >
            <ArrowLeft className="size-4" aria-hidden />
            Services
          </Link>
          <div className="grid items-end gap-10 md:grid-cols-[1.4fr_1fr]">
            <div>
              <h1 className="text-5xl font-semibold sm:text-7xl">{s.name}</h1>
              <p className="mt-5 max-w-lg text-xl opacity-90">{copy?.tagline ?? s.description}</p>
            </div>
            <div className="md:text-right">
              <p className="wide text-2xl font-semibold">
                {s.pricingModel === "HOURLY" ? "By the hour" : "Priced by the room"}
              </p>
              <p className="mt-1 text-sm opacity-80">
                {s.pricingModel === "HOURLY"
                  ? "Per cleaner-hour, 3-hour minimum"
                  : "Bedrooms and bathrooms, shown before you book"}
              </p>
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-6 pt-16">
        <RoomStrip hue={hue} blocks={homeBlocks(sampleHome(s.slug))} size="lg" />
        {copy ? (
          <div className="mt-16 grid gap-12 md:grid-cols-[1.4fr_1fr]">
            <section>
              <h2 className="text-2xl font-semibold">What&apos;s included</h2>
              <ul className="mt-5 border-t border-foreground">
                {copy.includes.map((i) => (
                  <li key={i} className="flex gap-3 border-b py-3.5">
                    <Check className="mt-0.5 size-4 shrink-0" aria-hidden />
                    {i}
                  </li>
                ))}
              </ul>
            </section>
            <section>
              <h2 className="text-2xl font-semibold">Ideal for</h2>
              <p className="mt-5 border-t border-foreground pt-4 text-lg">{copy.ideal}</p>
            </section>
          </div>
        ) : null}
        <div className="mt-14 flex flex-wrap gap-3">
          <Link
            href={`/book?service=${s.slug}`}
            className={buttonVariants({ size: "lg", className: "h-12 px-6" })}
          >
            Get an instant price
            <ArrowRight aria-hidden />
          </Link>
          <Link
            href="/locations"
            className={buttonVariants({ size: "lg", variant: "secondary", className: "h-12 px-6" })}
          >
            Check your area
          </Link>
        </div>
      </div>
    </div>
  );
}
