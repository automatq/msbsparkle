/**
 * Admin accounts: who can sign in to /admin and what they can see.
 *
 * - A SUPER_ADMIN manages everything; a REGION_ADMIN only the regions they are given.
 * - Admins never get a password from someone else. An invitation (or a reset) emails a single-use
 *   link where they choose their own. Only its SHA-256 hash is stored.
 * - The organization can never be left without a super admin who is able to sign in.
 *
 * No Auth.js / Next.js imports: the session layer calls into this, not the other way round.
 */
import { createHash, randomBytes } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/modules/db/client";
import { sendEmail } from "@/modules/notifications/email";
import { adminPasswordLinkTemplate } from "@/modules/notifications/templates";
import { brandName, siteUrl } from "@/modules/shared/site";
import { ForbiddenError, type Ctx } from "./access";
import { hashPassword } from "./password";
import { ADMIN_ROLES } from "./roles";

export type TeamScope = Pick<Ctx, "orgId" | "userId" | "isSuperAdmin">;

export type AdminAccess = { role: "SUPER_ADMIN" } | { role: "REGION_ADMIN"; regionIds: string[] };

/** A message that is safe to show to the admin as-is. */
export class TeamError extends Error {}

export const MIN_PASSWORD_LENGTH = 12;
export const INVITE_TTL_MS = 7 * 86_400_000;
export const RESET_TTL_MS = 60 * 60_000;

const TOKEN_PREFIX = "admin-password:";
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

type Db = Prisma.TransactionClient | typeof prisma;

function requireSuperAdmin(scope: TeamScope) {
  if (!scope.isSuperAdmin) throw new ForbiddenError("Only a super admin can manage the team.");
}

function notSelf(scope: TeamScope, userId: string) {
  if (scope.userId === userId)
    throw new TeamError("You can't change your own access. Ask another super admin.");
}

async function audit(
  db: Db,
  scope: TeamScope,
  userId: string,
  action: string,
  after?: Prisma.InputJsonValue,
) {
  await db.auditLog.create({
    data: {
      organizationId: scope.orgId,
      actorType: "ADMIN",
      actorId: scope.userId,
      entityType: "User",
      entityId: userId,
      action,
      ...(after === undefined ? {} : { after }),
    },
  });
}

async function validAccess(db: Db, orgId: string, access: AdminAccess): Promise<AdminAccess> {
  if (access.role === "SUPER_ADMIN") return { role: "SUPER_ADMIN" };
  const ids = [...new Set(access.regionIds)];
  if (!ids.length) throw new TeamError("Choose at least one region for a region admin.");
  const found = await db.region.count({ where: { id: { in: ids }, organizationId: orgId } });
  if (found !== ids.length) throw new TeamError("One of those regions no longer exists.");
  return { role: "REGION_ADMIN", regionIds: ids };
}

async function writeAccess(db: Db, userId: string, access: AdminAccess) {
  await db.userRole.deleteMany({ where: { userId, role: { in: ADMIN_ROLES } } });
  await db.userRole.createMany({
    data:
      access.role === "SUPER_ADMIN"
        ? [{ userId, role: "SUPER_ADMIN" as const }]
        : access.regionIds.map((regionId) => ({
            userId,
            role: "REGION_ADMIN" as const,
            regionId,
          })),
  });
}

/** Super admins who can actually sign in, other than `exceptUserId`. */
function otherWorkingSuperAdmins(db: Db, orgId: string, exceptUserId: string) {
  return db.user.count({
    where: {
      organizationId: orgId,
      id: { not: exceptUserId },
      status: "ACTIVE",
      passwordHash: { not: null },
      roles: { some: { role: "SUPER_ADMIN" } },
    },
  });
}

async function teamMember(db: Db, scope: TeamScope, userId: string) {
  const user = await db.user.findUnique({
    where: { id: userId },
    include: { roles: { where: { role: { in: ADMIN_ROLES } } } },
  });
  if (!user || user.organizationId !== scope.orgId || !user.roles.length)
    throw new TeamError("That person is no longer on the team.");
  return user;
}

/** Serializes changes to admin roles so two concurrent edits can't remove the last super admin. */
const lockTeam = (tx: Prisma.TransactionClient) =>
  tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('admin-team'))`;

// ── Password links ──────────────────────────────────────────────────────────

/** Replaces any earlier link for the user and returns the new URL. */
export async function issuePasswordLink(db: Db, userId: string, ttlMs: number, now = new Date()) {
  const token = randomBytes(32).toString("base64url");
  const identifier = `${TOKEN_PREFIX}${userId}`;
  await db.verificationToken.deleteMany({ where: { identifier } });
  await db.verificationToken.create({
    data: { identifier, token: sha256(token), expires: new Date(now.getTime() + ttlMs) },
  });
  return `${siteUrl}/admin/set-password/${token}`;
}

async function findLink(db: Db, token: string, now = new Date()) {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return null;
  const row = await db.verificationToken.findFirst({
    where: {
      token: sha256(token),
      identifier: { startsWith: TOKEN_PREFIX },
      expires: { gt: now },
    },
  });
  if (!row) return null;
  const user = await db.user.findUnique({
    where: { id: row.identifier.slice(TOKEN_PREFIX.length) },
    include: { roles: { where: { role: { in: ADMIN_ROLES } } } },
  });
  // A link stops working the moment the person is removed from the team or disabled.
  if (!user || user.status === "DISABLED" || !user.roles.length) return null;
  return { identifier: row.identifier, user };
}

/** Who a set-password link is for, or null when it is unknown, used or expired. */
export async function passwordLinkInfo(token: string) {
  const link = await findLink(prisma, token);
  if (!link) return null;
  return {
    email: link.user.email,
    name: link.user.name,
    isInvite: link.user.status === "INVITED" || !link.user.passwordHash,
  };
}

/** Sets the password from a link (single use) and signs the account out everywhere else. */
export async function setPasswordWithLink(token: string, password: string) {
  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH)
    throw new TeamError(`Use a password of at least ${MIN_PASSWORD_LENGTH} characters.`);
  if (password.length > 200) throw new TeamError("That password is too long.");
  const passwordHash = await hashPassword(password);
  return prisma.$transaction(async (tx) => {
    const link = await findLink(tx, token);
    if (!link) throw new TeamError("This link has expired or was already used. Ask for a new one.");
    const used = await tx.verificationToken.deleteMany({
      where: { identifier: link.identifier, token: sha256(token) },
    });
    if (used.count !== 1)
      throw new TeamError("This link has expired or was already used. Ask for a new one.");
    await tx.user.update({
      where: { id: link.user.id },
      data: {
        passwordHash,
        status: "ACTIVE",
        emailVerified: link.user.emailVerified ?? new Date(),
        sessionVersion: { increment: 1 },
      },
    });
    await tx.auditLog.create({
      data: {
        organizationId: link.user.organizationId,
        actorType: "ADMIN",
        actorId: link.user.id,
        entityType: "User",
        entityId: link.user.id,
        action: "admin.password.set",
      },
    });
    return { email: link.user.email };
  });
}

async function emailLink(
  user: { id: string; organizationId: string; email: string; name: string | null },
  link: string,
  kind: "invite" | "reset",
  invitedBy?: string | null,
): Promise<boolean> {
  const msg = adminPasswordLinkTemplate({
    brand: brandName,
    name: user.name,
    kind,
    link,
    invitedBy: invitedBy ?? null,
    validFor: kind === "invite" ? "7 days" : "1 hour",
  });
  try {
    await sendEmail({
      to: user.email,
      subject: msg.subject,
      html: msg.html,
      text: msg.text,
      templateKey: kind === "invite" ? "admin.invite" : "admin.password_reset",
      organizationId: user.organizationId,
      recipientType: "ADMIN",
      recipientId: user.id,
    });
    return true;
  } catch (e) {
    console.error(`[team] could not email the ${kind} link:`, e instanceof Error ? e.message : e);
    return false;
  }
}

export type LinkResult = { userId: string; link: string; emailed: boolean };

/**
 * Self-service "forgot password": emails a reset link if the address belongs to an admin who can
 * sign in. Says nothing either way, so it can't be used to find out who is an admin.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  const user = await prisma.user.findFirst({
    where: {
      email: email.trim().toLowerCase(),
      status: "ACTIVE",
      roles: { some: { role: { in: ADMIN_ROLES } } },
    },
  });
  if (!user) return;
  const link = await issuePasswordLink(prisma, user.id, RESET_TTL_MS);
  await emailLink(user, link, "reset");
}

// ── Team management (super admins) ──────────────────────────────────────────

export type TeamMember = {
  id: string;
  name: string | null;
  email: string;
  access: AdminAccess;
  regionNames: string[];
  state: "active" | "invited" | "disabled";
  twoFactor: boolean;
  isYou: boolean;
};

export async function listTeam(scope: TeamScope): Promise<TeamMember[]> {
  requireSuperAdmin(scope);
  const users = await prisma.user.findMany({
    where: { organizationId: scope.orgId, roles: { some: { role: { in: ADMIN_ROLES } } } },
    include: {
      roles: {
        where: { role: { in: ADMIN_ROLES } },
        include: { region: { select: { id: true, name: true } } },
      },
    },
    orderBy: [{ createdAt: "asc" }],
  });
  return users.map((u) => {
    const superAdmin = u.roles.some((r) => r.role === "SUPER_ADMIN");
    const regions = u.roles.flatMap((r) => (r.region ? [r.region] : []));
    return {
      id: u.id,
      name: u.name,
      email: u.email,
      access: superAdmin
        ? { role: "SUPER_ADMIN" }
        : { role: "REGION_ADMIN", regionIds: regions.map((r) => r.id) },
      regionNames: superAdmin ? [] : regions.map((r) => r.name).sort(),
      state:
        u.status === "DISABLED"
          ? "disabled"
          : u.status === "INVITED" || !u.passwordHash
            ? "invited"
            : "active",
      twoFactor: u.totpEnabled,
      isYou: u.id === scope.userId,
    };
  });
}

/** Adds someone to the team and emails them a link to choose their password. */
export async function inviteAdmin(
  scope: TeamScope,
  input: { name: string; email: string; access: AdminAccess },
): Promise<LinkResult> {
  requireSuperAdmin(scope);
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();
  if (!name) throw new TeamError("Enter their name.");
  const { user, link } = await prisma.$transaction(async (tx) => {
    await lockTeam(tx);
    const access = await validAccess(tx, scope.orgId, input.access);
    const existing = await tx.user.findUnique({
      where: { organizationId_email: { organizationId: scope.orgId, email } },
      include: { roles: { where: { role: { in: ADMIN_ROLES } } } },
    });
    if (existing?.roles.length)
      throw new TeamError(`${email} is already on the team. Change their access instead.`);
    if (existing?.status === "DISABLED")
      throw new TeamError(`The login for ${email} is disabled, so it can't be invited.`);
    // An existing login (a customer or cleaner with this email) keeps its status and gains access.
    const user = existing
      ? await tx.user.update({
          where: { id: existing.id },
          data: { name: existing.name ?? name },
        })
      : await tx.user.create({
          data: { organizationId: scope.orgId, email, name, status: "INVITED" },
        });
    await writeAccess(tx, user.id, access);
    await audit(tx, scope, user.id, "admin.invite", access);
    return { user, link: await issuePasswordLink(tx, user.id, INVITE_TTL_MS) };
  });
  const inviter = await prisma.user.findUnique({
    where: { id: scope.userId },
    select: { name: true },
  });
  return {
    userId: user.id,
    link,
    emailed: await emailLink(user, link, "invite", inviter?.name),
  };
}

/** Changes role and regions. Takes effect on their next page load. */
export async function setAdminAccess(
  scope: TeamScope,
  userId: string,
  input: AdminAccess,
): Promise<void> {
  requireSuperAdmin(scope);
  notSelf(scope, userId);
  await prisma.$transaction(async (tx) => {
    await lockTeam(tx);
    const user = await teamMember(tx, scope, userId);
    const access = await validAccess(tx, scope.orgId, input);
    const wasSuper = user.roles.some((r) => r.role === "SUPER_ADMIN");
    if (
      wasSuper &&
      access.role !== "SUPER_ADMIN" &&
      !(await otherWorkingSuperAdmins(tx, scope.orgId, userId))
    )
      throw new TeamError("There has to be at least one super admin who can sign in.");
    await writeAccess(tx, userId, access);
    // Ends their sessions, so the new access applies from their next sign-in, not 15 min later.
    await tx.user.update({ where: { id: userId }, data: { sessionVersion: { increment: 1 } } });
    await audit(tx, scope, userId, "admin.access.change", access);
  });
}

/** Takes someone off the team. Any customer or cleaner login they have keeps working. */
export async function removeAdmin(scope: TeamScope, userId: string): Promise<void> {
  requireSuperAdmin(scope);
  notSelf(scope, userId);
  await prisma.$transaction(async (tx) => {
    await lockTeam(tx);
    const user = await teamMember(tx, scope, userId);
    if (
      user.roles.some((r) => r.role === "SUPER_ADMIN") &&
      !(await otherWorkingSuperAdmins(tx, scope.orgId, userId))
    )
      throw new TeamError("There has to be at least one super admin who can sign in.");
    await tx.userRole.deleteMany({ where: { userId, role: { in: ADMIN_ROLES } } });
    await tx.verificationToken.deleteMany({ where: { identifier: `${TOKEN_PREFIX}${userId}` } });
    const otherRoles = await tx.userRole.count({ where: { userId } });
    await tx.user.update({
      where: { id: userId },
      data: {
        sessionVersion: { increment: 1 },
        // An admin-only login has no other way in: drop the password and 2FA with the access.
        ...(otherRoles ? {} : { passwordHash: null, totpEnabled: false, totpSecret: null }),
      },
    });
    await audit(tx, scope, userId, "admin.remove");
  });
}

/** Emails a fresh link: an invitation if they never set a password, otherwise a reset. */
export async function sendPasswordLink(scope: TeamScope, userId: string): Promise<LinkResult> {
  requireSuperAdmin(scope);
  const user = await teamMember(prisma, scope, userId);
  if (user.status === "DISABLED") throw new TeamError("That login is disabled.");
  const isInvite = user.status === "INVITED" || !user.passwordHash;
  const link = await issuePasswordLink(prisma, userId, isInvite ? INVITE_TTL_MS : RESET_TTL_MS);
  await audit(
    prisma,
    scope,
    userId,
    isInvite ? "admin.invite.resend" : "admin.password.reset_link",
  );
  const inviter = await prisma.user.findUnique({
    where: { id: scope.userId },
    select: { name: true },
  });
  return {
    userId,
    link,
    emailed: await emailLink(user, link, isInvite ? "invite" : "reset", inviter?.name),
  };
}

/** For someone who lost their authenticator: turns 2FA off so they can sign in and re-enrol. */
export async function resetTwoFactor(scope: TeamScope, userId: string): Promise<void> {
  requireSuperAdmin(scope);
  notSelf(scope, userId);
  await teamMember(prisma, scope, userId);
  await prisma.user.update({
    where: { id: userId },
    data: { totpEnabled: false, totpSecret: null, sessionVersion: { increment: 1 } },
  });
  await audit(prisma, scope, userId, "admin.2fa.reset");
}
