import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { hashPassword } from "@/modules/auth/password";
import { prisma } from "@/modules/db/client";
import { parseRatePercent } from "@/modules/pricing/tax-admin";
import { createRegionWithDefaults, parseAreaPrefixes } from "@/modules/regions/manage";
import { country, normalizePhone, timezone } from "@/modules/shared/country";
import { localDateToDateColumn, todayIn } from "@/modules/shared/dates";

/**
 * First-run setup: turns a freshly deployed, empty installation into a working one (company
 * details, the first super admin, optionally the first region with its areas and tax). Only
 * possible while no super admin exists, and only with the setup key (the AUTH_SECRET value the
 * deployer chose), so a stranger who finds a fresh deployment cannot claim it.
 */

type Db = Prisma.TransactionClient;

export async function isSetupPending(db: Db = prisma): Promise<boolean> {
  return (await db.userRole.count({ where: { role: "SUPER_ADMIN" } })) === 0;
}

/** Constant-time comparison of the typed key with AUTH_SECRET. */
export function verifySetupKey(input: string, secret = process.env.AUTH_SECRET ?? ""): boolean {
  if (!secret) return false;
  const a = createHash("sha256").update(input.trim()).digest();
  const b = createHash("sha256").update(secret).digest();
  return timingSafeEqual(a, b);
}

export const setupSchema = z
  .object({
    companyName: z.string().trim().min(1, "Enter the company name.").max(80),
    supportEmail: z.string().trim().email("Enter a valid support email."),
    supportPhone: z.string().trim().max(40).optional().or(z.literal("")),
    adminName: z.string().trim().min(1, "Enter your name.").max(80),
    adminEmail: z.string().trim().email("Enter a valid admin email."),
    adminPassword: z.string().min(12, "Use a password of at least 12 characters.").max(200),
    region: z
      .object({
        name: z.string().trim().min(1).max(80),
        province: z.string().trim().min(1).max(10),
        timezone: z.string().trim().min(1),
        areas: z.string().max(5000).default(""),
        taxName: z.string().trim().max(40).optional().or(z.literal("")),
        taxRate: z.string().trim().max(10).optional().or(z.literal("")),
      })
      .nullable()
      .default(null),
  })
  .superRefine((d, ctx) => {
    if (d.supportPhone && !normalizePhone(d.supportPhone))
      ctx.addIssue({ code: "custom", path: ["supportPhone"], message: "Enter a valid phone." });
    if (d.region?.taxName && parseRatePercent(d.region.taxRate ?? "") === null)
      ctx.addIssue({
        code: "custom",
        path: ["region", "taxRate"],
        message: "Enter the tax rate as a percentage, e.g. 13.",
      });
    if (d.region?.areas.trim()) {
      const { invalid } = parseAreaPrefixes(d.region.areas);
      if (invalid.length)
        ctx.addIssue({
          code: "custom",
          path: ["region", "areas"],
          message: `Not valid ${country.areaLabel}s: ${invalid.join(", ")}.`,
        });
    }
  });
export type SetupInput = z.input<typeof setupSchema>;

export class SetupError extends Error {}

/**
 * Applies setup in one transaction. Re-checks that setup is still pending inside the transaction
 * so two concurrent submissions cannot both create an admin.
 */
export async function completeSetup(raw: SetupInput, db?: Db) {
  const d = setupSchema.parse(raw);
  const run = async (tx: Db) => {
    // Serialize concurrent setups.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('first-run-setup'))`;
    if (!(await isSetupPending(tx))) throw new SetupError("Setup has already been completed.");

    const existing = await tx.organization.findFirst({ orderBy: { createdAt: "asc" } });
    const settings = {
      ...((existing?.settings as Record<string, unknown> | null) ?? {}),
      supportEmail: d.supportEmail.toLowerCase(),
      supportPhone: d.supportPhone || undefined,
    };
    const org = existing
      ? await tx.organization.update({
          where: { id: existing.id },
          data: { name: d.companyName, settings },
        })
      : await tx.organization.create({
          data: {
            name: d.companyName,
            slug: "company",
            defaultCurrency: country.currency,
            settings,
          },
        });

    const email = d.adminEmail.toLowerCase();
    const passwordHash = await hashPassword(d.adminPassword);
    const user = await tx.user.upsert({
      where: { organizationId_email: { organizationId: org.id, email } },
      update: { name: d.adminName, passwordHash, status: "ACTIVE" },
      create: {
        organizationId: org.id,
        email,
        name: d.adminName,
        passwordHash,
        emailVerified: new Date(),
        status: "ACTIVE",
      },
    });
    await tx.userRole.create({ data: { userId: user.id, role: "SUPER_ADMIN" } });

    let regionId: string | null = null;
    if (d.region) {
      const areas = parseAreaPrefixes(d.region.areas).valid;
      const region = await createRegionWithDefaults(
        org.id,
        {
          name: d.region.name,
          province: d.region.province,
          timezone: d.region.timezone,
          status: areas.length ? "ACTIVE" : "COMING_SOON",
          createCityPage: true,
        },
        tx,
      );
      regionId = region.id;
      if (areas.length) {
        const taken = await tx.serviceArea.findMany({
          where: { postalPrefix: { in: areas } },
          select: { postalPrefix: true },
        });
        const free = areas.filter((a) => !taken.some((t) => t.postalPrefix === a));
        await tx.serviceArea.createMany({
          data: free.map((postalPrefix) => ({ regionId: region.id, postalPrefix })),
        });
      }
      const rateBps = d.region.taxName ? parseRatePercent(d.region.taxRate ?? "") : null;
      if (d.region.taxName && rateBps) {
        const open = await tx.taxRate.findFirst({
          where: { province: d.region.province, name: d.region.taxName, effectiveTo: null },
        });
        if (!open)
          await tx.taxRate.create({
            data: {
              province: d.region.province,
              name: d.region.taxName,
              rateBps,
              effectiveFrom: localDateToDateColumn(todayIn(timezone)),
            },
          });
      }
    }
    return { organizationId: org.id, userId: user.id, regionId };
  };
  return db ? run(db) : prisma.$transaction(run, { timeout: 20_000 });
}
