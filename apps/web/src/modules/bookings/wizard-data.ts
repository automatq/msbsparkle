import type {
  ExtraOption,
  ServiceOption,
  WizardInitial,
} from "@/components/booking/booking-wizard";
import { prisma } from "@/modules/db/client";

/**
 * Data for the public booking wizard (/book and the embeddable /embed/book), plus prefill from the
 * query string: ?postal=&service=&bedrooms=&bathrooms=&frequency=
 */
export async function loadWizard(params: Record<string, string | string[] | undefined>): Promise<{
  services: ServiceOption[];
  extras: ExtraOption[];
  initial: WizardInitial;
}> {
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
  return {
    services,
    extras,
    initial: {
      postalCode: str(params.postal),
      serviceSlug: str(params.service),
      bedrooms: num(params.bedrooms),
      bathrooms: num(params.bathrooms),
      frequency:
        freq === "WEEKLY" || freq === "BIWEEKLY" || freq === "EVERY_4_WEEKS" || freq === "ONE_TIME"
          ? freq
          : undefined,
    },
  };
}
