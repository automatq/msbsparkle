/**
 * Admin team integration tests against the local database. Skipped when DATABASE_URL is unset.
 * Runs in its own temporary organization so the seeded admins never affect the
 * "last super admin" rules, and removes it afterwards.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/modules/db/client";
import {
  RESET_TTL_MS,
  TeamError,
  inviteAdmin,
  issuePasswordLink,
  listTeam,
  passwordLinkInfo,
  removeAdmin,
  requestPasswordReset,
  resetTwoFactor,
  sendPasswordLink,
  setAdminAccess,
  setPasswordWithLink,
  type TeamScope,
} from "./admin-users";
import { verifyPassword } from "./password";

const enabled = !!process.env.DATABASE_URL;
const tag = `team${Date.now().toString(36)}`;
const PASSWORD = "correct horse battery";
const tokenOf = (link: string) => link.split("/").pop()!;

let orgId = "";
let regionA = "";
let regionB = "";
let owner: TeamScope;

async function user(id: string) {
  return prisma.user.findUniqueOrThrow({ where: { id }, include: { roles: true } });
}

/** Invites someone and has them choose a password, like a real new admin. */
async function onboard(name: string, access: Parameters<typeof inviteAdmin>[1]["access"]) {
  const res = await inviteAdmin(owner, { name, email: `${name}@${tag}.test`, access });
  await setPasswordWithLink(tokenOf(res.link), PASSWORD);
  return res.userId;
}

describe.skipIf(!enabled)("admin team (integration)", () => {
  beforeAll(async () => {
    const org = await prisma.organization.create({ data: { name: `Team ${tag}`, slug: tag } });
    orgId = org.id;
    const region = (n: string) =>
      prisma.region.create({
        data: {
          organizationId: orgId,
          slug: `${tag}-${n}`,
          name: `Region ${n}`,
          province: "ON",
          timezone: "America/Toronto",
        },
      });
    regionA = (await region("a")).id;
    regionB = (await region("b")).id;
    const first = await prisma.user.create({
      data: {
        organizationId: orgId,
        email: `owner@${tag}.test`,
        name: "Olivia Owner",
        passwordHash: "x",
        status: "ACTIVE",
        roles: { create: { role: "SUPER_ADMIN" } },
      },
    });
    owner = { orgId, userId: first.id, isSuperAdmin: true };
  });

  afterAll(async () => {
    if (!orgId) return;
    const users = await prisma.user.findMany({
      where: { organizationId: orgId },
      select: { id: true },
    });
    await prisma.verificationToken.deleteMany({
      where: { identifier: { in: users.map((u) => `admin-password:${u.id}`) } },
    });
    await prisma.notification.deleteMany({ where: { organizationId: orgId } });
    await prisma.auditLog.deleteMany({ where: { organizationId: orgId } });
    await prisma.user.deleteMany({ where: { organizationId: orgId } });
    await prisma.region.deleteMany({ where: { organizationId: orgId } });
    await prisma.organization.delete({ where: { id: orgId } });
  });

  it("invites a region admin who then chooses their own password, once", async () => {
    const res = await inviteAdmin(owner, {
      name: "Rita Region",
      email: `  Rita@${tag}.TEST `,
      access: { role: "REGION_ADMIN", regionIds: [regionA, regionB, regionA] },
    });
    const invited = await user(res.userId);
    expect(invited).toMatchObject({
      email: `rita@${tag}.test`,
      status: "INVITED",
      passwordHash: null,
    });
    expect(invited.roles.map((r) => [r.role, r.regionId]).sort()).toEqual(
      [
        ["REGION_ADMIN", regionA],
        ["REGION_ADMIN", regionB],
      ].sort(),
    );
    expect(res.link).toMatch(/\/admin\/set-password\/[A-Za-z0-9_-]{40,}$/);

    const token = tokenOf(res.link);
    expect(await passwordLinkInfo(token)).toMatchObject({
      email: `rita@${tag}.test`,
      isInvite: true,
    });
    // Only a hash of the token is stored.
    expect(await prisma.verificationToken.count({ where: { token } })).toBe(0);

    await expect(setPasswordWithLink(token, "too short")).rejects.toThrow(/at least 12/);
    await setPasswordWithLink(token, PASSWORD);
    const active = await user(res.userId);
    expect(active.status).toBe("ACTIVE");
    expect(active.emailVerified).not.toBeNull();
    expect(await verifyPassword(active.passwordHash!, PASSWORD)).toBe(true);

    // Single use.
    expect(await passwordLinkInfo(token)).toBeNull();
    await expect(setPasswordWithLink(token, PASSWORD)).rejects.toThrow(
      /expired or was already used/,
    );

    const row = (await listTeam(owner)).find((m) => m.id === res.userId);
    expect(row).toMatchObject({
      state: "active",
      twoFactor: false,
      isYou: false,
      regionNames: ["Region a", "Region b"],
    });
  });

  it("validates invitations", async () => {
    const invite = (email: string, access: Parameters<typeof inviteAdmin>[1]["access"]) =>
      inviteAdmin(owner, { name: "Someone", email, access });
    await expect(invite(`x@${tag}.test`, { role: "REGION_ADMIN", regionIds: [] })).rejects.toThrow(
      /at least one region/,
    );
    const otherOrgRegion = await prisma.region.findFirstOrThrow({
      where: { organizationId: { not: orgId } },
    });
    await expect(
      invite(`x@${tag}.test`, { role: "REGION_ADMIN", regionIds: [otherOrgRegion.id] }),
    ).rejects.toThrow(/no longer exists/);
    await expect(invite(`owner@${tag}.test`, { role: "SUPER_ADMIN" })).rejects.toThrow(
      /already on the team/,
    );
    expect(await prisma.user.count({ where: { email: `x@${tag}.test` } })).toBe(0);
  });

  it("only super admins of the same organization can manage the team", async () => {
    const regionAdmin = await onboard("randy", { role: "REGION_ADMIN", regionIds: [regionA] });
    const asRegionAdmin: TeamScope = { orgId, userId: regionAdmin, isSuperAdmin: false };
    await expect(listTeam(asRegionAdmin)).rejects.toThrow(/Only a super admin/);
    await expect(
      inviteAdmin(asRegionAdmin, {
        name: "Eve",
        email: `eve@${tag}.test`,
        access: { role: "SUPER_ADMIN" },
      }),
    ).rejects.toThrow(/Only a super admin/);
    await expect(
      setAdminAccess(asRegionAdmin, regionAdmin, { role: "SUPER_ADMIN" }),
    ).rejects.toThrow();

    const outsider: TeamScope = { orgId: "another-org", userId: "someone", isSuperAdmin: true };
    await expect(removeAdmin(outsider, regionAdmin)).rejects.toThrow(/no longer on the team/);
    await expect(sendPasswordLink(outsider, regionAdmin)).rejects.toThrow(/no longer on the team/);
    expect((await user(regionAdmin)).roles).toHaveLength(1);
  });

  it("changes access and signs the person out so it applies at once", async () => {
    const id = await onboard("casey", { role: "REGION_ADMIN", regionIds: [regionA] });
    const before = (await user(id)).sessionVersion;
    await setAdminAccess(owner, id, { role: "SUPER_ADMIN" });
    let u = await user(id);
    expect(u.roles.map((r) => [r.role, r.regionId])).toEqual([["SUPER_ADMIN", null]]);
    expect(u.sessionVersion).toBe(before + 1);
    await setAdminAccess(owner, id, { role: "REGION_ADMIN", regionIds: [regionB] });
    u = await user(id);
    expect(u.roles.map((r) => [r.role, r.regionId])).toEqual([["REGION_ADMIN", regionB]]);
  });

  it("never leaves the company without a super admin who can sign in", async () => {
    // Nobody may change or remove themselves.
    await expect(
      setAdminAccess(owner, owner.userId, { role: "REGION_ADMIN", regionIds: [regionA] }),
    ).rejects.toThrow(/your own access/);
    await expect(removeAdmin(owner, owner.userId)).rejects.toThrow(/your own access/);
    await expect(resetTwoFactor(owner, owner.userId)).rejects.toThrow(/your own access/);

    // A second super admin who hasn't chosen a password yet doesn't count as a way in, so the
    // owner is still the last one and can't be removed or demoted.
    const pending = await inviteAdmin(owner, {
      name: "Pat Pending",
      email: `pat@${tag}.test`,
      access: { role: "SUPER_ADMIN" },
    });
    const asPat: TeamScope = { orgId, userId: pending.userId, isSuperAdmin: true };
    const demoted = { role: "REGION_ADMIN" as const, regionIds: [regionA] };
    await expect(removeAdmin(asPat, owner.userId)).rejects.toThrow(/at least one super admin/);
    await expect(setAdminAccess(asPat, owner.userId, demoted)).rejects.toThrow(
      /at least one super admin/,
    );

    // Once Pat can sign in, the owner may be demoted. Then Pat is the last one.
    await setPasswordWithLink(tokenOf(pending.link), PASSWORD);
    await setAdminAccess(asPat, owner.userId, demoted);
    await expect(removeAdmin(owner, pending.userId)).rejects.toThrow(/at least one super admin/);
    await expect(setAdminAccess(owner, pending.userId, demoted)).rejects.toThrow(
      /at least one super admin/,
    );

    // With the owner a super admin again, Pat can go; an admin-only login loses its password too.
    await setAdminAccess(asPat, owner.userId, { role: "SUPER_ADMIN" });
    await removeAdmin(owner, pending.userId);
    const gone = await user(pending.userId);
    expect(gone.roles).toHaveLength(0);
    expect(gone.passwordHash).toBeNull();
  });

  it("removing an admin keeps their other logins and kills pending links", async () => {
    const id = await onboard("dana", { role: "SUPER_ADMIN" });
    await prisma.userRole.create({ data: { userId: id, role: "CUSTOMER" } });
    const link = await issuePasswordLink(prisma, id, RESET_TTL_MS);
    await removeAdmin(owner, id);
    const u = await user(id);
    expect(u.roles.map((r) => r.role)).toEqual(["CUSTOMER"]);
    expect(u.passwordHash).not.toBeNull(); // still a customer login; admin access is what's gone
    expect(await passwordLinkInfo(tokenOf(link))).toBeNull();
    expect((await listTeam(owner)).some((m) => m.id === id)).toBe(false);
    await expect(removeAdmin(owner, id)).rejects.toThrow(/no longer on the team/);
  });

  it("resets a lost authenticator and re-sends links", async () => {
    const id = await onboard("toni", { role: "REGION_ADMIN", regionIds: [regionA] });
    await prisma.user.update({
      where: { id },
      data: { totpEnabled: true, totpSecret: "encrypted" },
    });
    await resetTwoFactor(owner, id);
    expect(await user(id)).toMatchObject({ totpEnabled: false, totpSecret: null });

    // A new link replaces the previous one.
    const first = await sendPasswordLink(owner, id);
    const second = await sendPasswordLink(owner, id);
    expect(await passwordLinkInfo(tokenOf(first.link))).toBeNull();
    expect(await passwordLinkInfo(tokenOf(second.link))).toMatchObject({ isInvite: false });

    // Links expire.
    const stale = await issuePasswordLink(
      prisma,
      id,
      RESET_TTL_MS,
      new Date(Date.now() - RESET_TTL_MS - 1000),
    );
    expect(await passwordLinkInfo(tokenOf(stale))).toBeNull();
  });

  it("forgot password only issues a link for an admin who can sign in", async () => {
    const id = await onboard("fran", { role: "REGION_ADMIN", regionIds: [regionA] });
    const links = () =>
      prisma.verificationToken.count({ where: { identifier: `admin-password:${id}` } });
    expect(await links()).toBe(0);
    await requestPasswordReset(`FRAN@${tag}.test`);
    expect(await links()).toBe(1);

    await requestPasswordReset(`nobody@${tag}.test`); // unknown: silently nothing
    const customer = await prisma.user.create({
      data: {
        organizationId: orgId,
        email: `cust@${tag}.test`,
        roles: { create: { role: "CUSTOMER" } },
      },
    });
    await requestPasswordReset(customer.email);
    expect(
      await prisma.verificationToken.count({
        where: { identifier: `admin-password:${customer.id}` },
      }),
    ).toBe(0);
    expect(TeamError).toBeDefined();
  });
});
