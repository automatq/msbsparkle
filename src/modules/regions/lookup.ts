import { prisma } from "@/modules/db/client";

const POSTAL_RE = /^[A-Z]\d[A-Z]\d[A-Z]\d$/;
const FSA_RE = /^[A-Z]\d[A-Z]$/;

/** Uppercases and strips spaces. Returns null unless it is a full postal code or an FSA. */
export function normalizePostal(input: string): { postalCode: string | null; fsa: string } | null {
  const raw = input.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (POSTAL_RE.test(raw))
    return { postalCode: `${raw.slice(0, 3)} ${raw.slice(3)}`, fsa: raw.slice(0, 3) };
  if (FSA_RE.test(raw)) return { postalCode: null, fsa: raw };
  return null;
}

/**
 * `ServiceArea.fsa` is globally unique today (v1 has one organization), so this filters by
 * `organizationId` in application code rather than the query itself. If this is ever sold to
 * multiple organizations serving overlapping FSAs, `fsa` will need to become unique per-org.
 */
export async function findRegionByFsa(organizationId: string, fsa: string) {
  const area = await prisma.serviceArea.findUnique({
    where: { fsa },
    include: { region: true },
  });
  if (!area || !area.active || area.region.status !== "ACTIVE") return null;
  if (area.region.organizationId !== organizationId) return null;
  return area.region;
}
