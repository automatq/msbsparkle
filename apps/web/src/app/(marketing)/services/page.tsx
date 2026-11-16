import type { Metadata } from "next";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
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
    <div className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="text-4xl font-semibold tracking-tight">Cleaning services</h1>
      <p className="mt-2 text-muted-foreground">
        Every service is priced upfront online. Recurring plans save 10 to 20%.
      </p>
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {services.map((s) => (
          <Link
            key={s.id}
            href={`/services/${s.slug}`}
            className="rounded-xl border p-5 hover:bg-muted/40"
          >
            <p className="text-lg font-medium">{s.name}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {SERVICE_COPY[s.slug]?.tagline ?? s.description}
            </p>
          </Link>
        ))}
      </div>
      <div className="mt-10">
        <Link href="/book" className={buttonVariants({ size: "lg" })}>
          Get an instant price
        </Link>
      </div>
    </div>
  );
}
