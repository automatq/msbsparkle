import type { MetadataRoute } from "next";
import { prisma } from "@/modules/db/client";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const [cities, services] = await Promise.all([
    prisma.city.findMany({
      where: { active: true, region: { status: "ACTIVE" } },
      select: { slug: true, updatedAt: true },
    }),
    prisma.service.findMany({ where: { active: true }, select: { slug: true, updatedAt: true } }),
  ]);
  const statics = [
    "",
    "/services",
    "/locations",
    "/reviews",
    "/careers",
    "/careers/apply",
    "/gift-cards",
    "/faq",
    "/guarantee",
    "/contact",
    "/privacy",
    "/terms",
    "/book",
  ];
  return [
    ...statics.map((p) => ({
      url: `${base}${p}`,
      changeFrequency: "weekly" as const,
      priority: p === "" ? 1 : 0.6,
    })),
    ...services.map((s) => ({
      url: `${base}/services/${s.slug}`,
      lastModified: s.updatedAt,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
    ...cities.map((c) => ({
      url: `${base}/house-cleaning-service-${c.slug}`,
      lastModified: c.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
  ];
}
