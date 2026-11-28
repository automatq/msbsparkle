/**
 * Colour belongs to the services (globals.css, rule 1): each has a hue of its own, worked out
 * here from its slug rather than stored. The services every company starts with (prisma/seed.ts)
 * have fixed ones; a service a company adds gets one from the rest, the same every time.
 */
export const HUES = [
  "lagoon",
  "cobalt",
  "marigold",
  "sky",
  "clay",
  "coral",
  "jungle",
  "orchid",
  "fig",
  "olive",
  "rose",
  "midnight",
] as const;
export type Hue = (typeof HUES)[number];

const FIXED: Record<string, Hue> = {
  standard: "lagoon",
  deep: "cobalt",
  "move-in-out": "marigold",
  condo: "sky",
  "post-renovation": "clay",
  airbnb: "coral",
  office: "jungle",
};

const SPARE = HUES.filter((h) => !Object.values(FIXED).includes(h));

export function serviceHue(slug: string): Hue {
  const fixed = FIXED[slug];
  if (fixed) return fixed;
  let n = 0;
  for (const ch of slug) n = (n * 31 + ch.charCodeAt(0)) >>> 0;
  return SPARE[n % SPARE.length];
}

/** The home a service is pictured with (its room strip on the service list and page). */
const SAMPLE: Record<string, { bedrooms: number; bathrooms: number }> = {
  standard: { bedrooms: 2, bathrooms: 1 },
  deep: { bedrooms: 3, bathrooms: 2 },
  "move-in-out": { bedrooms: 3, bathrooms: 2.5 },
  condo: { bedrooms: 1, bathrooms: 1 },
  "post-renovation": { bedrooms: 3, bathrooms: 2 },
  airbnb: { bedrooms: 2, bathrooms: 1.5 },
  office: { bedrooms: 4, bathrooms: 2 },
};

export function sampleHome(slug: string): { bedrooms: number; bathrooms: number } {
  return SAMPLE[slug] ?? { bedrooms: 2, bathrooms: 1 };
}
