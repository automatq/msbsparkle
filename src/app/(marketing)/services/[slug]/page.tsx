import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import { prisma } from "@/modules/db/client";
import { SERVICE_COPY, jsonLd } from "@/modules/marketing/content";

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
  const brand = process.env.NEXT_PUBLIC_BRAND_NAME ?? "MSB Sparkle";
  const ld = {
    "@context": "https://schema.org",
    "@type": "Service",
    name: s.name,
    description: s.description,
    provider: { "@type": "Organization", name: brand },
    areaServed: "CA",
    offers: { "@type": "Offer", priceCurrency: "CAD", availability: "https://schema.org/InStock" },
  };
  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(ld) }} />
      <p className="text-xs text-muted-foreground">
        <Link href="/services">Services</Link> / {s.name}
      </p>
      <h1 className="mt-2 text-4xl font-semibold tracking-tight">{s.name}</h1>
      <p className="mt-2 text-lg text-muted-foreground">{copy?.tagline ?? s.description}</p>
      {copy ? (
        <div className="mt-8 grid gap-8 md:grid-cols-2">
          <section>
            <h2 className="font-medium">What&apos;s included</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              {copy.includes.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
          </section>
          <section>
            <h2 className="font-medium">Ideal for</h2>
            <p className="mt-2 text-sm text-muted-foreground">{copy.ideal}</p>
            <p className="mt-4 text-sm text-muted-foreground">
              {s.pricingModel === "HOURLY"
                ? "Billed per cleaner-hour with a 3-hour minimum."
                : "Flat-rate pricing by bedrooms and bathrooms, shown before you book."}
            </p>
          </section>
        </div>
      ) : null}
      <div className="mt-10 flex gap-3">
        <Link href={`/book?service=${s.slug}`} className={buttonVariants({ size: "lg" })}>
          Get an instant price
        </Link>
        <Link href="/locations" className={buttonVariants({ size: "lg", variant: "outline" })}>
          Check your area
        </Link>
      </div>
    </div>
  );
}
