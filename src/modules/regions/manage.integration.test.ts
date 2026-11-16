/**
 * Integration tests against the seeded database (Canadian defaults). Skipped without DATABASE_URL.
 */
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/modules/db/client";
import { createQuote } from "@/modules/pricing/quote-service";
import { addTaxRate, deleteScheduledTaxRate, endTaxRate } from "@/modules/pricing/tax-admin";
import { addServiceAreas, createRegionWithDefaults } from "./manage";

const enabled = !!process.env.DATABASE_URL;
const created = { regions: [] as string[], taxes: [] as string[] };

describe.skipIf(!enabled)("region, service area and tax admin (integration)", () => {
  afterAll(async () => {
    await prisma.taxRate.deleteMany({ where: { province: "YT" } });
    await prisma.city.deleteMany({ where: { regionId: { in: created.regions } } });
    await prisma.region.deleteMany({ where: { id: { in: created.regions } } });
  });

  it("creates a region with default windows, capacity, a unique slug and a city page", async () => {
    const org = await prisma.organization.findFirstOrThrow();
    const input = { name: "Whitehorse", province: "YT", timezone: "America/Whitehorse" };
    const a = await createRegionWithDefaults(org.id, { ...input, createCityPage: true });
    const b = await createRegionWithDefaults(org.id, input);
    created.regions.push(a.id, b.id);

    expect(a.status).toBe("COMING_SOON");
    expect(b.slug).toBe(`${a.slug}-2`);
    const windows = await prisma.arrivalWindow.findMany({ where: { regionId: a.id } });
    expect(windows).toHaveLength(4);
    const caps = await prisma.windowCapacity.findMany({ where: { regionId: a.id } });
    expect(caps).toHaveLength(28);
    expect(caps.filter((c) => c.weekday === 0).every((c) => c.capacity === 0)).toBe(true);
    expect(await prisma.city.count({ where: { regionId: a.id } })).toBe(1);
  });

  it("adds service areas without stealing prefixes from other regions", async () => {
    const [regionId] = created.regions;
    const toronto = await prisma.serviceArea.findFirstOrThrow({ where: { postalPrefix: "M5V" } });
    const res = await addServiceAreas(regionId, ["Y1A", "M5V"]);
    expect(res.added).toEqual(["Y1A"]);
    expect(res.elsewhere.map((e) => e.prefix)).toEqual(["M5V"]);
    const again = await addServiceAreas(regionId, ["Y1A"]);
    expect(again.added).toEqual([]);
    expect(again.alreadyHere).toEqual(["Y1A"]);
    expect(
      (await prisma.serviceArea.findUniqueOrThrow({ where: { id: toronto.id } })).regionId,
    ).toBe(toronto.regionId);
  });

  it("replacing a tax rate ends the old one the day the new one starts", async () => {
    const first = await addTaxRate({
      province: "YT",
      name: "GST",
      rateBps: 500,
      effectiveFrom: "2020-01-01",
    });
    const second = await addTaxRate({
      province: "YT",
      name: "GST",
      rateBps: 600,
      effectiveFrom: "2021-01-01",
    });
    const old = await prisma.taxRate.findUniqueOrThrow({ where: { id: first.id } });
    expect(old.effectiveTo?.toISOString().slice(0, 10)).toBe("2021-01-01");
    await expect(
      addTaxRate({ province: "YT", name: "GST", rateBps: 700, effectiveFrom: "2020-06-01" }),
    ).rejects.toThrow(/already has a rate/);
    await expect(endTaxRate(second.id, "2020-12-31")).rejects.toThrow(/after the date/);
    await expect(deleteScheduledTaxRate(second.id, "2026-01-01")).rejects.toThrow(/end it instead/);
  });

  it("a new region takes quotes once it has an area and is active, with its tax", async () => {
    const [regionId] = created.regions;
    const req = {
      postalCode: "Y1A 2B3",
      serviceSlug: "standard",
      bedrooms: 2,
      bathrooms: 1,
      frequency: "ONE_TIME" as const,
      extras: [],
    };
    const before = await createQuote(req);
    expect(!before.ok && before.error.code).toBe("OUT_OF_AREA"); // still COMING_SOON

    await prisma.region.update({ where: { id: regionId }, data: { status: "ACTIVE" } });
    const after = await createQuote(req);
    if (!after.ok) throw new Error(after.error.message);
    expect(after.data.region.id).toBe(regionId);
    const q = after.data.quote;
    expect(q.taxCents).toBe(Math.round((q.taxableCents * 600) / 10000));
  });
});
