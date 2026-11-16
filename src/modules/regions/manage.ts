import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/modules/db/client";
import { country, type CountryProfile } from "@/modules/shared/country";

/** Arrival windows every new region starts with (editable later). */
export const DEFAULT_WINDOWS = [
  { label: "8am – 10am", startLocal: "08:00", endLocal: "10:00" },
  { label: "10am – 12pm", startLocal: "10:00", endLocal: "12:00" },
  { label: "12pm – 2pm", startLocal: "12:00", endLocal: "14:00" },
  { label: "2pm – 4pm", startLocal: "14:00", endLocal: "16:00" },
] as const;

/** Jobs per window by weekday (0 = Sunday): closed Sundays, 4 per window otherwise. */
export const DEFAULT_WEEKDAY_CAPACITY = [0, 4, 4, 4, 4, 4, 4];

export function slugify(name: string): string {
  return (
    name
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "region"
  );
}

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export type NewRegion = {
  name: string;
  province: string;
  timezone: string;
  phone?: string | null;
  email?: string | null;
  status?: "ACTIVE" | "COMING_SOON" | "PAUSED";
  /** Also create a public city page with the region's name. */
  createCityPage?: boolean;
};

export class RegionInputError extends Error {}

export function validateNewRegion(input: NewRegion, profile: CountryProfile = country): void {
  if (!input.name.trim()) throw new RegionInputError("Enter a region name.");
  if (!profile.subdivisions.some((s) => s.code === input.province))
    throw new RegionInputError(`Choose a ${profile.subdivisionLabel.toLowerCase()}.`);
  if (!isValidTimezone(input.timezone)) throw new RegionInputError("Choose a valid timezone.");
}

/**
 * Creates a region with the default arrival windows and weekly capacity, and optionally a city
 * page. Used by the admin and by first-run setup. Accepts a transaction client.
 */
export async function createRegionWithDefaults(
  organizationId: string,
  input: NewRegion,
  db: Prisma.TransactionClient = prisma,
) {
  validateNewRegion(input);
  const base = slugify(input.name);
  let slug = base;
  for (
    let n = 2;
    await db.region.findUnique({ where: { organizationId_slug: { organizationId, slug } } });
    n++
  )
    slug = `${base}-${n}`;

  const region = await db.region.create({
    data: {
      organizationId,
      slug,
      name: input.name.trim(),
      province: input.province,
      timezone: input.timezone,
      phone: input.phone?.trim() || null,
      email: input.email?.trim() || null,
      status: input.status ?? "COMING_SOON",
      launchedAt: input.status === "ACTIVE" ? new Date() : null,
    },
  });
  for (const [i, w] of DEFAULT_WINDOWS.entries()) {
    const window = await db.arrivalWindow.create({
      data: { regionId: region.id, ...w, sortOrder: i },
    });
    await db.windowCapacity.createMany({
      data: DEFAULT_WEEKDAY_CAPACITY.map((capacity, weekday) => ({
        regionId: region.id,
        windowId: window.id,
        weekday,
        capacity,
      })),
    });
  }
  if (input.createCityPage) {
    let citySlug = slug;
    for (let n = 2; await db.city.findUnique({ where: { slug: citySlug } }); n++)
      citySlug = `${slug}-${n}`;
    await db.city.create({
      data: {
        regionId: region.id,
        name: region.name,
        slug: citySlug,
        province: region.province,
        active: true,
      },
    });
  }
  return region;
}

/**
 * Splits pasted text ("M5V, M5W m6a" or one per line) into valid, de-duplicated service-area
 * prefixes for the deployment country, and the tokens that were not valid.
 */
export function parseAreaPrefixes(
  text: string,
  profile: CountryProfile = country,
): { valid: string[]; invalid: string[] } {
  const valid = new Set<string>();
  const invalid = new Set<string>();
  for (const token of text.split(/[\s,;]+/).filter(Boolean)) {
    const p = profile.normalizeAreaPrefix(token);
    if (p) valid.add(p);
    else invalid.add(token);
  }
  return { valid: [...valid], invalid: [...invalid] };
}

/**
 * Adds service areas to a region. A prefix can only belong to one region; ones already taken are
 * reported (with the owning region) rather than moved.
 */
export async function addServiceAreas(regionId: string, prefixes: string[]) {
  const existing = await prisma.serviceArea.findMany({
    where: { postalPrefix: { in: prefixes } },
    include: { region: { select: { id: true, name: true } } },
  });
  const taken = new Map(existing.map((a) => [a.postalPrefix, a.region]));
  const toAdd = prefixes.filter((p) => !taken.has(p));
  if (toAdd.length)
    await prisma.serviceArea.createMany({
      data: toAdd.map((postalPrefix) => ({ regionId, postalPrefix })),
      skipDuplicates: true,
    });
  return {
    added: toAdd,
    alreadyHere: existing.filter((a) => a.region.id === regionId).map((a) => a.postalPrefix),
    elsewhere: existing
      .filter((a) => a.region.id !== regionId)
      .map((a) => ({ prefix: a.postalPrefix, regionName: a.region.name })),
  };
}
