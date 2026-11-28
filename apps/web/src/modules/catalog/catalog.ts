/**
 * The catalog: what the company sells (services, add-on extras) and the cleaning checklists
 * attached to services. Until this module existed these rows could only come from the seed.
 *
 * How it fits with pricing: prices live in versioned pricing tables, keyed by the service or
 * extra `slug` (BASE / FIRST_CLEAN_UPGRADE / EXTRA rates). Two rules follow.
 * - A slug is permanent. Saved quotes and every pricing version refer to it.
 * - Creating a service or extra adds its starting price to every pricing table that isn't
 *   archived. That changes no existing price (the key is new), so price history stays intact.
 *   Later price changes go through a new pricing version, like any other price.
 *
 * No Next.js imports: the admin actions call into this.
 */
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { ForbiddenError, type Ctx } from "@/modules/auth/access";
import { prisma } from "@/modules/db/client";
import { slugify } from "@/modules/regions/manage";

export type CatalogScope = Pick<Ctx, "orgId" | "userId" | "isSuperAdmin">;

/** A message that is safe to show to the admin as-is. */
export class CatalogError extends Error {}

type Tx = Prisma.TransactionClient;

function requireSuperAdmin(scope: CatalogScope) {
  if (!scope.isSuperAdmin) throw new ForbiddenError("Only a super admin can change the catalog.");
}

async function audit(
  tx: Tx,
  scope: CatalogScope,
  entityType: "Service" | "Extra" | "ChecklistTemplate",
  entityId: string,
  action: string,
  after?: Prisma.InputJsonValue,
) {
  await tx.auditLog.create({
    data: {
      organizationId: scope.orgId,
      actorType: "ADMIN",
      actorId: scope.userId,
      entityType,
      entityId,
      action,
      ...(after === undefined ? {} : { after }),
    },
  });
}

/** A free slug for the organization, derived from the name ("Deep clean" → "deep-clean"). */
async function freeSlug(taken: (slug: string) => Promise<boolean>, name: string): Promise<string> {
  const base = slugify(name) || "item";
  for (let n = 1; n < 100; n++) {
    const slug = n === 1 ? base : `${base}-${n}`;
    if (!(await taken(slug))) return slug;
  }
  throw new CatalogError("Choose a different name.");
}

/** Adds a rate for a new key to every pricing table that isn't archived and doesn't have it. */
async function addStartingRate(
  tx: Tx,
  orgId: string,
  kind: "BASE" | "FIRST_CLEAN_UPGRADE" | "EXTRA",
  key: string,
  price: { amountCents: number; minutes: number },
) {
  const tables = await tx.pricingTable.findMany({
    where: { organizationId: orgId, status: { not: "ARCHIVED" } },
    select: { id: true },
  });
  if (!tables.length) return;
  await tx.pricingRate.createMany({
    data: tables.map((t) => ({ pricingTableId: t.id, kind, key, ...price })),
    skipDuplicates: true,
  });
}

/** The pricing table customers are quoted from today (company-wide, published, in effect). */
async function currentTableId(orgId: string, now = new Date()): Promise<string | null> {
  const t = await prisma.pricingTable.findFirst({
    where: {
      organizationId: orgId,
      regionId: null,
      status: "PUBLISHED",
      effectiveFrom: { lte: now },
    },
    orderBy: { effectiveFrom: "desc" },
    select: { id: true },
  });
  return t?.id ?? null;
}

async function currentRates(orgId: string, kinds: ("BASE" | "FIRST_CLEAN_UPGRADE" | "EXTRA")[]) {
  const tableId = await currentTableId(orgId);
  if (!tableId) return new Map<string, { amountCents: number | null; minutes: number | null }>();
  const rates = await prisma.pricingRate.findMany({
    where: { pricingTableId: tableId, kind: { in: kinds } },
    select: { kind: true, key: true, amountCents: true, minutes: true },
  });
  return new Map(rates.map((r) => [`${r.kind}:${r.key}`, r]));
}

const money = z.number().int().min(0).max(10_000_00);
const minutes = z
  .number()
  .int()
  .min(0)
  .max(24 * 60);
const startingPrice = z.object({ amountCents: money, minutes });
const text = (max: number) => z.string().trim().max(max);

// ── Services ────────────────────────────────────────────────────────────────

export const serviceSchema = z.object({
  id: z.string().min(1).optional(),
  name: text(80).min(2, "Enter a name."),
  description: text(400).optional().default(""),
  pricingModel: z.enum(["FLAT", "HOURLY"]),
  /** Also offered as a one-time upgrade to the first visit of a recurring plan. */
  isUpgrade: z.boolean().default(false),
  checklistTemplateId: z.string().min(1).nullable().default(null),
  sortOrder: z.number().int().min(0).max(9999).default(0),
  active: z.boolean().default(true),
  /** Required when creating a flat-rate service: its base price before rooms are added. */
  startingPrice: startingPrice.optional(),
  /** Required when creating a service that is offered as a first-clean upgrade. */
  upgradePrice: startingPrice.optional(),
});
export type ServiceInput = z.input<typeof serviceSchema>;

export async function listServices(scope: CatalogScope) {
  requireSuperAdmin(scope);
  const [services, rates] = await Promise.all([
    prisma.service.findMany({
      where: { organizationId: scope.orgId },
      include: {
        checklistTemplate: { select: { id: true, name: true } },
        _count: { select: { bookings: true, jobs: true } },
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    currentRates(scope.orgId, ["BASE", "FIRST_CLEAN_UPGRADE"]),
  ]);
  return services.map((s) => {
    const base = rates.get(`BASE:${s.slug}`);
    const upgrade = rates.get(`FIRST_CLEAN_UPGRADE:${s.slug}`);
    return {
      id: s.id,
      slug: s.slug,
      name: s.name,
      description: s.description ?? "",
      pricingModel: s.pricingModel,
      isUpgrade: s.isUpgrade,
      checklist: s.checklistTemplate,
      sortOrder: s.sortOrder,
      active: s.active,
      inUse: s._count.bookings + s._count.jobs > 0,
      baseCents: base?.amountCents ?? null,
      baseMinutes: base?.minutes ?? null,
      upgradeCents: upgrade?.amountCents ?? null,
      /** A flat-rate service without a base price can't be quoted, so it can't be booked. */
      missingPrice: s.pricingModel === "FLAT" && base?.amountCents == null,
    };
  });
}

async function checklistInOrg(tx: Tx, orgId: string, templateId: string | null) {
  if (!templateId) return;
  const t = await tx.checklistTemplate.findUnique({
    where: { id: templateId },
    select: { organizationId: true },
  });
  if (!t || t.organizationId !== orgId) throw new CatalogError("That checklist no longer exists.");
}

/** Creates or updates a service. Returns its id and slug. */
export async function saveService(scope: CatalogScope, raw: ServiceInput) {
  requireSuperAdmin(scope);
  const d = serviceSchema.parse(raw);
  return prisma.$transaction(async (tx) => {
    await checklistInOrg(tx, scope.orgId, d.checklistTemplateId);
    const fields = {
      name: d.name,
      description: d.description || null,
      pricingModel: d.pricingModel,
      isUpgrade: d.isUpgrade,
      checklistTemplateId: d.checklistTemplateId,
      sortOrder: d.sortOrder,
      active: d.active,
    };
    if (d.id) {
      const existing = await tx.service.findUnique({ where: { id: d.id } });
      if (!existing || existing.organizationId !== scope.orgId)
        throw new CatalogError("That service no longer exists.");
      // Prices given while editing only fill gaps (e.g. it just became an upgrade option).
      if (d.pricingModel === "FLAT" && d.startingPrice)
        await addStartingRate(tx, scope.orgId, "BASE", existing.slug, d.startingPrice);
      if (d.isUpgrade && d.upgradePrice)
        await addStartingRate(
          tx,
          scope.orgId,
          "FIRST_CLEAN_UPGRADE",
          existing.slug,
          d.upgradePrice,
        );
      await tx.service.update({ where: { id: existing.id }, data: fields });
      await audit(tx, scope, "Service", existing.id, "catalog.service.update", fields);
      return { id: existing.id, slug: existing.slug };
    }
    if (d.pricingModel === "FLAT" && !d.startingPrice)
      throw new CatalogError("Enter the base price for this service.");
    if (d.isUpgrade && !d.upgradePrice)
      throw new CatalogError("Enter the price of the first-clean upgrade.");
    const slug = await freeSlug(
      async (s) =>
        !!(await tx.service.findUnique({
          where: { organizationId_slug: { organizationId: scope.orgId, slug: s } },
        })),
      d.name,
    );
    const created = await tx.service.create({
      data: { organizationId: scope.orgId, slug, ...fields },
    });
    if (d.pricingModel === "FLAT" && d.startingPrice)
      await addStartingRate(tx, scope.orgId, "BASE", slug, d.startingPrice);
    if (d.isUpgrade && d.upgradePrice)
      await addStartingRate(tx, scope.orgId, "FIRST_CLEAN_UPGRADE", slug, d.upgradePrice);
    await audit(tx, scope, "Service", created.id, "catalog.service.create", { slug, ...fields });
    return { id: created.id, slug };
  });
}

/**
 * Deletes a service that was never booked, with its prices. One that has bookings can't be
 * deleted (history refers to it): turn it off instead, which hides it from customers.
 */
export async function deleteService(scope: CatalogScope, id: string) {
  requireSuperAdmin(scope);
  await prisma.$transaction(async (tx) => {
    const s = await tx.service.findUnique({
      where: { id },
      include: { _count: { select: { bookings: true, upgradeBookings: true, jobs: true } } },
    });
    if (!s || s.organizationId !== scope.orgId)
      throw new CatalogError("That service no longer exists.");
    if (s._count.bookings + s._count.upgradeBookings + s._count.jobs > 0)
      throw new CatalogError(
        `${s.name} has bookings, so it can't be deleted. Turn it off to stop offering it.`,
      );
    await tx.pricingRate.deleteMany({
      where: {
        table: { organizationId: scope.orgId },
        key: s.slug,
        kind: { in: ["BASE", "FIRST_CLEAN_UPGRADE", "SERVICE_SURCHARGE"] },
      },
    });
    await tx.service.delete({ where: { id } });
    await audit(tx, scope, "Service", id, "catalog.service.delete", { slug: s.slug });
  });
}

// ── Extras ──────────────────────────────────────────────────────────────────

export const extraSchema = z.object({
  id: z.string().min(1).optional(),
  name: text(80).min(2, "Enter a name."),
  description: text(300).optional().default(""),
  /** FIXED: one price. PER_UNIT: price × quantity (e.g. per window), up to maxQty. */
  unit: z.enum(["FIXED", "PER_UNIT"]),
  maxQty: z.number().int().min(1).max(50).default(1),
  sortOrder: z.number().int().min(0).max(9999).default(0),
  active: z.boolean().default(true),
  /** Required when creating: the price (per unit) and the minutes it adds to a visit. */
  startingPrice: startingPrice.optional(),
});
export type ExtraInput = z.input<typeof extraSchema>;

export async function listExtras(scope: CatalogScope) {
  requireSuperAdmin(scope);
  const [extras, rates] = await Promise.all([
    prisma.extra.findMany({
      where: { organizationId: scope.orgId },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    currentRates(scope.orgId, ["EXTRA"]),
  ]);
  return extras.map((e) => {
    const rate = rates.get(`EXTRA:${e.slug}`);
    return {
      id: e.id,
      slug: e.slug,
      name: e.name,
      description: e.description ?? "",
      unit: e.unit,
      maxQty: e.maxQty,
      sortOrder: e.sortOrder,
      active: e.active,
      priceCents: rate?.amountCents ?? null,
      minutes: rate?.minutes ?? null,
      /** Without a price the quote ignores the extra, so customers would get it for free. */
      missingPrice: rate?.amountCents == null,
    };
  });
}

export async function saveExtra(scope: CatalogScope, raw: ExtraInput) {
  requireSuperAdmin(scope);
  const d = extraSchema.parse(raw);
  return prisma.$transaction(async (tx) => {
    const fields = {
      name: d.name,
      description: d.description || null,
      unit: d.unit,
      maxQty: d.unit === "FIXED" ? 1 : d.maxQty,
      sortOrder: d.sortOrder,
      active: d.active,
    };
    if (d.id) {
      const existing = await tx.extra.findUnique({ where: { id: d.id } });
      if (!existing || existing.organizationId !== scope.orgId)
        throw new CatalogError("That add-on no longer exists.");
      if (d.startingPrice)
        await addStartingRate(tx, scope.orgId, "EXTRA", existing.slug, d.startingPrice);
      await tx.extra.update({
        where: { id: existing.id },
        data: { ...fields, defaultMinutes: d.startingPrice?.minutes ?? existing.defaultMinutes },
      });
      await audit(tx, scope, "Extra", existing.id, "catalog.extra.update", fields);
      return { id: existing.id, slug: existing.slug };
    }
    if (!d.startingPrice) throw new CatalogError("Enter the price for this add-on.");
    const slug = await freeSlug(
      async (s) =>
        !!(await tx.extra.findUnique({
          where: { organizationId_slug: { organizationId: scope.orgId, slug: s } },
        })),
      d.name,
    );
    const created = await tx.extra.create({
      data: {
        organizationId: scope.orgId,
        slug,
        ...fields,
        defaultMinutes: d.startingPrice.minutes,
      },
    });
    await addStartingRate(tx, scope.orgId, "EXTRA", slug, d.startingPrice);
    await audit(tx, scope, "Extra", created.id, "catalog.extra.create", { slug, ...fields });
    return { id: created.id, slug };
  });
}

/**
 * Deletes an add-on and its prices. Past bookings keep their own copy of what was ordered, so
 * nothing in history breaks; open bookings that include it are refused, to avoid surprises.
 */
export async function deleteExtra(scope: CatalogScope, id: string) {
  requireSuperAdmin(scope);
  await prisma.$transaction(async (tx) => {
    const e = await tx.extra.findUnique({ where: { id } });
    if (!e || e.organizationId !== scope.orgId)
      throw new CatalogError("That add-on no longer exists.");
    const onIt = { array_contains: [{ slug: e.slug }] };
    const [visits, plans] = await Promise.all([
      tx.job.count({
        where: {
          organizationId: scope.orgId,
          status: { in: ["PENDING", "CONFIRMED", "ASSIGNED", "EN_ROUTE", "IN_PROGRESS"] },
          extras: onIt,
        },
      }),
      // Recurring plans keep generating visits from their own list of extras.
      tx.booking.count({
        where: {
          organizationId: scope.orgId,
          status: { in: ["ACTIVE", "PAUSED"] },
          extras: onIt,
        },
      }),
    ]);
    if (visits + plans)
      throw new CatalogError(
        `${e.name} is on ${visits} upcoming visit${visits === 1 ? "" : "s"} and ${plans} active booking${plans === 1 ? "" : "s"}. Turn it off to stop offering it.`,
      );
    await tx.pricingRate.deleteMany({
      where: { table: { organizationId: scope.orgId }, kind: "EXTRA", key: e.slug },
    });
    await tx.extra.delete({ where: { id } });
    await audit(tx, scope, "Extra", id, "catalog.extra.delete", { slug: e.slug });
  });
}

// ── Checklists ──────────────────────────────────────────────────────────────

export const checklistSchema = z.object({
  id: z.string().min(1).optional(),
  name: text(80).min(2, "Enter a name."),
  items: z
    .array(
      z.object({
        section: text(60).min(1, "Every item needs a room or section."),
        label: text(160).min(1, "An item is empty."),
        /** The cleaner can't check out until this item is ticked. */
        requiresPhoto: z.boolean().default(false),
      }),
    )
    .min(1, "Add at least one item.")
    .max(200),
});
export type ChecklistInput = z.input<typeof checklistSchema>;

export async function listChecklists(scope: CatalogScope) {
  requireSuperAdmin(scope);
  const rows = await prisma.checklistTemplate.findMany({
    where: { organizationId: scope.orgId },
    include: {
      items: { orderBy: { sortOrder: "asc" } },
      services: { select: { id: true, name: true }, orderBy: { name: "asc" } },
    },
    orderBy: { name: "asc" },
  });
  return rows.map((t) => ({
    id: t.id,
    name: t.name,
    services: t.services,
    items: t.items.map((i) => ({
      section: i.section,
      label: i.label,
      requiresPhoto: i.requiresPhoto,
    })),
  }));
}

/**
 * Creates or replaces a checklist. Visits copy the checklist when the cleaner first needs it,
 * so edits apply to visits that haven't started yet and never rewrite a finished one.
 */
export async function saveChecklist(scope: CatalogScope, raw: ChecklistInput) {
  requireSuperAdmin(scope);
  const d = checklistSchema.parse(raw);
  return prisma.$transaction(async (tx) => {
    let id = d.id;
    if (id) {
      const existing = await tx.checklistTemplate.findUnique({ where: { id } });
      if (!existing || existing.organizationId !== scope.orgId)
        throw new CatalogError("That checklist no longer exists.");
      await tx.checklistTemplate.update({ where: { id }, data: { name: d.name } });
      await tx.checklistTemplateItem.deleteMany({ where: { templateId: id } });
    } else {
      id = (
        await tx.checklistTemplate.create({
          data: { organizationId: scope.orgId, name: d.name },
        })
      ).id;
    }
    await tx.checklistTemplateItem.createMany({
      data: d.items.map((item, i) => ({ templateId: id!, ...item, sortOrder: i + 1 })),
    });
    await audit(
      tx,
      scope,
      "ChecklistTemplate",
      id,
      d.id ? "catalog.checklist.update" : "catalog.checklist.create",
      {
        name: d.name,
        items: d.items.length,
      },
    );
    return { id };
  });
}

/** Deletes a checklist. Services that used it simply have no checklist afterwards. */
export async function deleteChecklist(scope: CatalogScope, id: string) {
  requireSuperAdmin(scope);
  await prisma.$transaction(async (tx) => {
    const t = await tx.checklistTemplate.findUnique({ where: { id } });
    if (!t || t.organizationId !== scope.orgId)
      throw new CatalogError("That checklist no longer exists.");
    await tx.service.updateMany({
      where: { checklistTemplateId: id },
      data: { checklistTemplateId: null },
    });
    await tx.checklistTemplate.delete({ where: { id } });
    await audit(tx, scope, "ChecklistTemplate", id, "catalog.checklist.delete", { name: t.name });
  });
}
