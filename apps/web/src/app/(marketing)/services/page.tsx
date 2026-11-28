import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { ServiceRows } from "@/components/marketing/service-rows";
import { prisma } from "@/modules/db/client";
import { SERVICE_COPY } from "@/modules/marketing/content";

export const revalidate = 3600;
export const metadata: Metadata = {
  title: "Services",
  description: "Standard, deep, move-in/out, condo, post-renovation, Airbnb and office cleaning.",
};

export default async function ServicesPage() {
  const services = await prisma.service.findMany({
    where: { active: true },
    orderBy: { sortOrder: "asc" },
  });
  return (
    <div className="mx-auto max-w-6xl px-6 pt-6">
      <h1 className="text-5xl font-semibold sm:text-6xl">Cleaning services</h1>
      <p className="mt-4 max-w-xl text-lg text-muted-foreground">
        Every service is priced upfront online. Recurring plans save 10 to 20%.
      </p>
      <div className="mt-12">
        <ServiceRows
          services={services.map((s) => ({
            slug: s.slug,
            name: s.name,
            line: SERVICE_COPY[s.slug]?.tagline ?? s.description,
          }))}
        />
      </div>
      <Link href="/book" className={buttonVariants({ size: "lg", className: "mt-12 h-12 px-6" })}>
        Get an instant price
        <ArrowRight aria-hidden />
      </Link>
    </div>
  );
}
