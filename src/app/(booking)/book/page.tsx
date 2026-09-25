import { BookingWizard, type WizardInitial } from "@/components/booking/booking-wizard";
import { prisma } from "@/modules/db/client";

export const dynamic = "force-dynamic";

export default async function BookPage({ searchParams }: PageProps<"/book">) {
  const params = await searchParams;
  const org = await prisma.organization.findFirstOrThrow({ select: { id: true } });
  const [services, extras] = await Promise.all([
    prisma.service.findMany({
      where: { organizationId: org.id, active: true },
      orderBy: { sortOrder: "asc" },
      select: {
        id: true,
        slug: true,
        name: true,
        description: true,
        pricingModel: true,
        isUpgrade: true,
      },
    }),
    prisma.extra.findMany({
      where: { organizationId: org.id, active: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, slug: true, name: true, unit: true, maxQty: true },
    }),
  ]);
  const str = (v: unknown) => (typeof v === "string" ? v : undefined);
  const num = (v: unknown) =>
    typeof v === "string" && v !== "" && !Number.isNaN(Number(v)) ? Number(v) : undefined;
  const freq = str(params.frequency);
  const initial: WizardInitial = {
    postalCode: str(params.postal),
    serviceSlug: str(params.service),
    bedrooms: num(params.bedrooms),
    bathrooms: num(params.bathrooms),
    frequency:
      freq === "WEEKLY" || freq === "BIWEEKLY" || freq === "EVERY_4_WEEKS" || freq === "ONE_TIME"
        ? freq
        : undefined,
  };
  return <BookingWizard services={services} extras={extras} initial={initial} />;
}
