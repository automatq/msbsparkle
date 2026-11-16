import { prisma } from "@/modules/db/client";
import { country, type NormalizedPostal } from "@/modules/shared/country";

/**
 * Normalizes a postal/ZIP code for the deployment country. Returns null when it is neither a full
 * code nor a recognised area (Canada: "M5V 2T6" or "M5V"; US: "90210", "90210-1234" or "902").
 */
export function normalizePostal(input: string): NormalizedPostal | null {
  return country.normalizePostal(input);
}

/**
 * Finds the active service area for a postal code, preferring the most specific prefix (a ZIP5
 * area wins over its ZIP3). Returns the matched area's prefix along with its region.
 */
export async function findServiceArea(postal: NormalizedPostal) {
  const areas = await prisma.serviceArea.findMany({
    where: { postalPrefix: { in: postal.prefixes }, active: true },
    include: { region: true },
  });
  for (const prefix of postal.prefixes) {
    const area = areas.find((a) => a.postalPrefix === prefix);
    if (area && area.region.status === "ACTIVE") return area;
  }
  return null;
}

export async function findRegionForPostal(postal: NormalizedPostal) {
  return (await findServiceArea(postal))?.region ?? null;
}

/** The key shown to customers and stored for out-of-area requests: the broadest prefix. */
export function areaKey(postal: NormalizedPostal): string {
  return postal.prefixes[postal.prefixes.length - 1];
}
