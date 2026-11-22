/**
 * Catalog integration tests against the seeded local database. Skipped when DATABASE_URL is
 * unset. Everything created here carries a unique tag in its name (and so in its slug) and is
 * removed afterwards.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cleanerFixtures } from "@/modules/cleaner/test-fixtures";
import { prisma } from "@/modules/db/client";
import { createQuote } from "@/modules/pricing/quote-service";
import {
  deleteChecklist,
  deleteExtra,
  deleteService,
  listChecklists,
  listExtras,
  listServices,
  saveChecklist,
  saveExtra,
  saveService,
  type CatalogScope,
} from "./catalog";

const enabled = !!process.env.DATABASE_URL;
const tag = `zq${Date.now().toString(36)}`;
const fx = cleanerFixtures(tag, 9500);
const quoteIds: string[] = [];
let scope: CatalogScope;
let orgId = "";

const quoteFor = async (serviceSlug: string, extras: { slug: string; qty: number }[] = []) => {
  const res = await createQuote({
    postalCode: "M5V 2T6",
    serviceSlug,
    bedrooms: 2,
    bathrooms: 1,
    extras,
    frequency: "ONE_TIME",
  });
  if (res.ok) quoteIds.push(res.data.quoteId);
  return res;
};

const ratesFor = (key: string) =>
  prisma.pricingRate.findMany({
    where: { key, table: { organizationId: orgId } },
    include: { table: { select: { status: true } } },
  });

describe.skipIf(!enabled)("catalog (integration)", () => {
  beforeAll(async () => {
    const region = await prisma.region.findFirstOrThrow({ where: { slug: "toronto" } });
    orgId = region.organizationId;
    scope = { orgId, userId: "test-admin", isSuperAdmin: true };
  });

  afterAll(async () => {
    await prisma.priceQuote.deleteMany({ where: { id: { in: quoteIds } } });
    await fx.cleanup();
    await prisma.pricingRate.deleteMany({ where: { key: { startsWith: tag } } });
    await prisma.service.deleteMany({
      where: { organizationId: orgId, slug: { startsWith: tag } },
    });
    await prisma.extra.deleteMany({ where: { organizationId: orgId, slug: { startsWith: tag } } });
    await prisma.checklistTemplate.deleteMany({
      where: { organizationId: orgId, name: { startsWith: tag } },
    });
    await prisma.pricingTable.deleteMany({
      where: { organizationId: orgId, notes: { startsWith: tag } },
    });
    await prisma.auditLog.deleteMany({
      where: { organizationId: orgId, actorId: "test-admin", action: { startsWith: "catalog." } },
    });
  });

  it("a new flat-rate service gets a permanent slug and a price, and can be quoted at once", async () => {
    // A draft and an archived pricing version alongside the published one.
    const published = await prisma.pricingTable.findFirstOrThrow({
      where: { organizationId: orgId, regionId: null, status: "PUBLISHED" },
      orderBy: { version: "desc" },
    });
    const extra = (status: "DRAFT" | "ARCHIVED", version: number) =>
      prisma.pricingTable.create({
        data: {
          organizationId: orgId,
          regionId: null,
          version,
          status,
          effectiveFrom: new Date(),
          notes: `${tag} ${status}`,
        },
      });
    await extra("DRAFT", published.version + 9000 + (Date.now() % 900));
    await extra("ARCHIVED", published.version + 19000 + (Date.now() % 900));

    const name = `${tag} Garage tidy`;
    const created = await saveService(scope, {
      name,
      description: "Sweep, wipe and sort.",
      pricingModel: "FLAT",
      startingPrice: { amountCents: 12900, minutes: 150 },
    });
    expect(created.slug).toBe(`${tag}-garage-tidy`);

    const rates = await ratesFor(created.slug);
    expect(rates.every((r) => r.kind === "BASE" && r.amountCents === 12900)).toBe(true);
    expect(rates.map((r) => r.table.status)).toContain("PUBLISHED");
    expect(rates.map((r) => r.table.status)).toContain("DRAFT");
    expect(rates.map((r) => r.table.status)).not.toContain("ARCHIVED");

    const quote = await quoteFor(created.slug);
    expect(quote.ok).toBe(true);
    if (quote.ok)
      expect(quote.data.quote.lines.find((l) => l.step === "BASE")?.amountCents).toBe(12900);

    const row = (await listServices(scope)).find((s) => s.id === created.id);
    expect(row).toMatchObject({
      baseCents: 12900,
      baseMinutes: 150,
      missingPrice: false,
      inUse: false,
    });

    // Renaming keeps the slug (saved quotes and prices refer to it); a same-named one gets -2.
    const renamed = await saveService(scope, {
      id: created.id,
      name: `${tag} Garage clean`,
      pricingModel: "FLAT",
      sortOrder: 7,
    });
    expect(renamed.slug).toBe(created.slug);
    const twin = await saveService(scope, {
      name,
      pricingModel: "FLAT",
      startingPrice: { amountCents: 100, minutes: 10 },
    });
    expect(twin.slug).toBe(`${tag}-garage-tidy-2`);
  });

  it("requires prices where a quote would otherwise fail", async () => {
    await expect(
      saveService(scope, { name: `${tag} No price`, pricingModel: "FLAT" }),
    ).rejects.toThrow(/base price/);
    await expect(
      saveService(scope, {
        name: `${tag} Upgrade`,
        pricingModel: "FLAT",
        isUpgrade: true,
        startingPrice: { amountCents: 100, minutes: 10 },
      }),
    ).rejects.toThrow(/first-clean upgrade/);
    // Hourly services use the company's hourly rate, so they need no base price.
    const hourly = await saveService(scope, { name: `${tag} Hourly help`, pricingModel: "HOURLY" });
    expect(await ratesFor(hourly.slug)).toHaveLength(0);
    expect((await listServices(scope)).find((s) => s.id === hourly.id)?.missingPrice).toBe(false);
  });

  it("deletes a service that was never booked, and refuses one that has bookings", async () => {
    const unused = await saveService(scope, {
      name: `${tag} Unused`,
      pricingModel: "FLAT",
      isUpgrade: true,
      startingPrice: { amountCents: 5000, minutes: 60 },
      upgradePrice: { amountCents: 2000, minutes: 30 },
    });
    expect((await ratesFor(unused.slug)).map((r) => r.kind).sort()).toContain(
      "FIRST_CLEAN_UPGRADE",
    );
    await deleteService(scope, unused.id);
    expect(await ratesFor(unused.slug)).toHaveLength(0);
    expect(await prisma.service.findUnique({ where: { id: unused.id } })).toBeNull();

    const cleaner = await fx.makeCleaner();
    const { job } = await fx.makeJob(cleaner.id, "ACCEPTED", { daysAhead: 3 });
    await expect(deleteService(scope, job.serviceId)).rejects.toThrow(/has bookings/);
    expect(await prisma.service.findUnique({ where: { id: job.serviceId } })).not.toBeNull();
  });

  it("a new add-on is priced in quotes; one in use can't be deleted", async () => {
    const perUnit = await saveExtra(scope, {
      name: `${tag} Skylight`,
      unit: "PER_UNIT",
      maxQty: 6,
      startingPrice: { amountCents: 1500, minutes: 10 },
    });
    const fixed = await saveExtra(scope, {
      name: `${tag} Oven`,
      unit: "FIXED",
      maxQty: 9, // ignored for a fixed-price add-on
      startingPrice: { amountCents: 4000, minutes: 30 },
    });
    const listed = await listExtras(scope);
    expect(listed.find((e) => e.id === perUnit.id)).toMatchObject({
      priceCents: 1500,
      minutes: 10,
      maxQty: 6,
      missingPrice: false,
    });
    expect(listed.find((e) => e.id === fixed.id)?.maxQty).toBe(1);

    const quote = await quoteFor("standard", [{ slug: perUnit.slug, qty: 3 }]);
    expect(quote.ok).toBe(true);
    if (quote.ok)
      expect(quote.data.quote.lines.find((l) => l.key === perUnit.slug)?.amountCents).toBe(4500);

    await expect(saveExtra(scope, { name: `${tag} Free?`, unit: "FIXED" })).rejects.toThrow(
      /price/,
    );

    // On an upcoming visit: can't be deleted. Once that visit is done, it can.
    const cleaner = await fx.makeCleaner();
    const { job } = await fx.makeJob(cleaner.id, "ACCEPTED", { daysAhead: 3 });
    await prisma.job.update({
      where: { id: job.id },
      data: { extras: [{ slug: perUnit.slug, qty: 2 }] },
    });
    await expect(deleteExtra(scope, perUnit.id)).rejects.toThrow(/1 upcoming visit /);
    await prisma.job.update({ where: { id: job.id }, data: { status: "COMPLETED" } });
    await deleteExtra(scope, perUnit.id);
    expect(await ratesFor(perUnit.slug)).toHaveLength(0);
    expect((await listExtras(scope)).some((e) => e.id === perUnit.id)).toBe(false);
  });

  it("checklists can be created, attached to a service, replaced and deleted", async () => {
    const list = await saveChecklist(scope, {
      name: `${tag} Kitchen deep`,
      items: [
        { section: "Kitchen", label: "Degrease hood", requiresPhoto: true },
        { section: "Kitchen", label: "Clean inside microwave" },
      ],
    });
    const service = await saveService(scope, {
      name: `${tag} Kitchen special`,
      pricingModel: "HOURLY",
      checklistTemplateId: list.id,
    });
    let row = (await listChecklists(scope)).find((c) => c.id === list.id);
    expect(row?.services.map((s) => s.id)).toEqual([service.id]);
    expect(row?.items).toEqual([
      { section: "Kitchen", label: "Degrease hood", requiresPhoto: true },
      { section: "Kitchen", label: "Clean inside microwave", requiresPhoto: false },
    ]);

    await saveChecklist(scope, {
      id: list.id,
      name: `${tag} Kitchen deep v2`,
      items: [{ section: "Kitchen", label: "Everything" }],
    });
    row = (await listChecklists(scope)).find((c) => c.id === list.id);
    expect(row).toMatchObject({ name: `${tag} Kitchen deep v2` });
    expect(row?.items).toHaveLength(1);

    await expect(saveChecklist(scope, { name: `${tag} Empty`, items: [] })).rejects.toThrow();
    await deleteChecklist(scope, list.id);
    expect(
      (await prisma.service.findUniqueOrThrow({ where: { id: service.id } })).checklistTemplateId,
    ).toBeNull();
  });

  it("is limited to super admins of the same organization", async () => {
    const regionAdmin = { ...scope, isSuperAdmin: false };
    await expect(listServices(regionAdmin)).rejects.toThrow(/Only a super admin/);
    await expect(
      saveExtra(regionAdmin, {
        name: `${tag} Nope`,
        unit: "FIXED",
        startingPrice: { amountCents: 1, minutes: 1 },
      }),
    ).rejects.toThrow(/Only a super admin/);

    const mine = await saveService(scope, { name: `${tag} Mine`, pricingModel: "HOURLY" });
    const outsider: CatalogScope = { orgId: "another-org", userId: "x", isSuperAdmin: true };
    await expect(deleteService(outsider, mine.id)).rejects.toThrow(/no longer exists/);
    await expect(
      saveService(outsider, { id: mine.id, name: "Hijacked", pricingModel: "HOURLY" }),
    ).rejects.toThrow(/no longer exists/);
    expect((await prisma.service.findUniqueOrThrow({ where: { id: mine.id } })).name).toBe(
      `${tag} Mine`,
    );
  });
});
