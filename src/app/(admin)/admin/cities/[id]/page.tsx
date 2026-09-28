import Link from "next/link";
import { notFound } from "next/navigation";
import { CityEditor } from "@/components/admin/marketing-panels";
import { requireRole } from "@/modules/auth/session";
import { prisma } from "@/modules/db/client";

export const dynamic = "force-dynamic";

export default async function CityAdminPage({ params }: PageProps<"/admin/cities/[id]">) {
  await requireRole("/admin/login", "SUPER_ADMIN");
  const { id } = await params;
  const city = await prisma.city.findUnique({ where: { id }, include: { region: true } });
  if (!city) notFound();
  return (
    <div className="max-w-3xl space-y-4">
      <p className="text-xs text-muted-foreground">
        <Link href="/admin/regions" className="hover:underline">
          Regions
        </Link>{" "}
        /{" "}
        <Link href={`/admin/regions/${city.regionId}`} className="hover:underline">
          {city.region.name}
        </Link>{" "}
        / {city.name}
      </p>
      <h1 className="text-2xl font-semibold">{city.name} landing page</h1>
      <p className="text-sm text-muted-foreground">
        Public URL:{" "}
        <a href={`/house-cleaning-service-${city.slug}`} target="_blank" className="underline">
          /house-cleaning-service-{city.slug}
        </a>
        . Saving republishes the page immediately.
      </p>
      <CityEditor
        id={city.id}
        initial={{
          name: city.name,
          seoTitle: city.seoTitle ?? "",
          seoDescription: city.seoDescription ?? "",
          intro: city.intro ?? "",
          neighborhoods: city.neighborhoods,
          faqs: (city.faqs as { q: string; a: string }[] | null) ?? [],
          active: city.active,
        }}
      />
    </div>
  );
}
