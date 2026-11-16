/**
 * Runs the whole first-run setup against the seeded database inside a transaction that is rolled
 * back, so CI's demo admin and data are untouched. Skipped without DATABASE_URL.
 */
import { describe, expect, it } from "vitest";
import { prisma } from "@/modules/db/client";
import { completeSetup, isSetupPending } from "./setup";

const enabled = !!process.env.DATABASE_URL;
class Rollback extends Error {}

describe.skipIf(!enabled)("first-run setup (integration)", () => {
  it("creates the admin, company details, an active region with areas and tax, once", async () => {
    expect(await isSetupPending()).toBe(false); // the demo seed has a super admin
    const email = `owner-${Date.now()}@example.com`;
    const input = {
      companyName: "Acme Cleaning",
      supportEmail: "help@acme.test",
      supportPhone: "(416) 555-0123",
      adminName: "Ada Owner",
      adminEmail: email,
      adminPassword: "a long enough password",
      region: {
        name: "Iqaluit",
        province: "NU",
        timezone: "America/Toronto",
        areas: "X0A",
        taxName: "GST",
        taxRate: "5",
      },
    };

    await expect(
      prisma.$transaction(
        async (tx) => {
          await tx.userRole.deleteMany({ where: { role: "SUPER_ADMIN" } });
          expect(await isSetupPending(tx)).toBe(true);

          const res = await completeSetup(input, tx);

          const user = await tx.user.findUniqueOrThrow({
            where: { id: res.userId },
            include: { roles: true },
          });
          expect(user.email).toBe(email);
          expect(user.passwordHash).toBeTruthy();
          expect(user.passwordHash).not.toContain("a long enough password");
          expect(user.roles.map((r) => r.role)).toEqual(["SUPER_ADMIN"]);

          const org = await tx.organization.findUniqueOrThrow({
            where: { id: res.organizationId },
          });
          expect(org.name).toBe("Acme Cleaning");
          expect((org.settings as { supportEmail: string }).supportEmail).toBe("help@acme.test");

          const region = await tx.region.findUniqueOrThrow({
            where: { id: res.regionId! },
            include: { serviceAreas: true, windows: true },
          });
          expect(region.status).toBe("ACTIVE");
          expect(region.serviceAreas.map((a) => a.postalPrefix)).toEqual(["X0A"]);
          expect(region.windows).toHaveLength(4);
          expect(
            await tx.taxRate.count({ where: { province: "NU", name: "GST", effectiveTo: null } }),
          ).toBe(1);

          expect(await isSetupPending(tx)).toBe(false);
          await expect(
            completeSetup({ ...input, adminEmail: `second-${email}` }, tx),
          ).rejects.toThrow(/already been completed/);
          throw new Rollback();
        },
        { timeout: 30_000 },
      ),
    ).rejects.toBeInstanceOf(Rollback);

    // Rolled back: the demo admin is still there and nothing from setup remains.
    expect(await isSetupPending()).toBe(false);
    expect(await prisma.user.count({ where: { email } })).toBe(0);
  });
});
