/**
 * A US deployment end to end on the server side: region in Texas, a ZIP area, sales tax, and a
 * quote for a ZIP+4. The country preset is read at import time, so the env is stubbed before the
 * modules load. Skipped without DATABASE_URL.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const enabled = !!process.env.DATABASE_URL;

describe.skipIf(!enabled)("US deployment (integration)", () => {
  let mods: {
    prisma: typeof import("@/modules/db/client").prisma;
    manage: typeof import("./manage");
    tax: typeof import("@/modules/pricing/tax-admin");
    quotes: typeof import("@/modules/pricing/quote-service");
  };
  let regionId = "";

  beforeAll(async () => {
    vi.stubEnv("NEXT_PUBLIC_COUNTRY", "US");
    vi.resetModules();
    mods = {
      prisma: (await import("@/modules/db/client")).prisma,
      manage: await import("./manage"),
      tax: await import("@/modules/pricing/tax-admin"),
      quotes: await import("@/modules/pricing/quote-service"),
    };
  });

  afterAll(async () => {
    await mods.prisma.taxRate.deleteMany({ where: { province: "TX" } });
    if (regionId) await mods.prisma.region.delete({ where: { id: regionId } });
    vi.unstubAllEnvs();
  });

  it("creates a Texas region, serves a ZIP and quotes a ZIP+4 with sales tax", async () => {
    const { prisma, manage, tax, quotes } = mods;
    const org = await prisma.organization.findFirstOrThrow();
    expect(() =>
      manage.validateNewRegion({ name: "x", province: "ON", timezone: "America/Chicago" }),
    ).toThrow(/state/);

    const region = await manage.createRegionWithDefaults(org.id, {
      name: "Austin",
      province: "TX",
      timezone: "America/Chicago",
      status: "ACTIVE",
    });
    regionId = region.id;
    const { valid, invalid } = manage.parseAreaPrefixes("78701, 787 M5V");
    expect(valid).toEqual(["78701", "787"]);
    expect(invalid).toEqual(["M5V"]);
    await manage.addServiceAreas(region.id, ["78701"]);
    await tax.addTaxRate({
      province: "TX",
      name: "Sales tax",
      rateBps: 625,
      effectiveFrom: "2020-01-01",
    });

    const res = await quotes.createQuote({
      postalCode: "78701-1234",
      serviceSlug: "standard",
      bedrooms: 2,
      bathrooms: 1,
      frequency: "ONE_TIME",
      extras: [],
    });
    if (!res.ok) throw new Error(res.error.message);
    expect(res.data.region.name).toBe("Austin");
    expect(res.data.quote.taxCents).toBe(Math.round((res.data.quote.taxableCents * 625) / 10000));

    const outside = await quotes.createQuote({
      postalCode: "90210",
      serviceSlug: "standard",
      bedrooms: 2,
      bathrooms: 1,
      frequency: "ONE_TIME",
      extras: [],
    });
    expect(!outside.ok && outside.error.code).toBe("OUT_OF_AREA");
  });
});
