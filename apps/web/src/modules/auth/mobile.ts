/**
 * Sessions for the cleaner mobile app (bearer tokens; the web portal keeps Auth.js cookies).
 *
 * Tokens are 256-bit random strings, stored only as SHA-256 hashes. Every request looks its
 * session up, so revocation (sign-out, suspension, a replayed refresh token) is immediate.
 * - Access token: 15 minutes.
 * - Refresh token: single use, rotated on each refresh, 60-day sliding expiry. Presenting the
 *   previous refresh token again means it was copied: the whole session is revoked.
 */
import { createHash, randomBytes } from "node:crypto";
import type { DeviceInfo, TokenPair } from "@msb/shared/mobile-api";
import { prisma } from "@/modules/db/client";
import { isSuperAdmin, scopedRegionIds } from "./roles";
import type { Ctx } from "./session";

export const ACCESS_TTL_MS = 15 * 60 * 1000;
export const REFRESH_TTL_MS = 60 * 24 * 60 * 60 * 1000;
/** lastSeenAt is only written when older than this, to keep reads cheap. */
const SEEN_RESOLUTION_MS = 5 * 60 * 1000;

const ACCESS_PREFIX = "msb_at_";
const REFRESH_PREFIX = "msb_rt_";

const newToken = (prefix: string) => prefix + randomBytes(32).toString("base64url");
export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

function freshTokens(now: Date) {
  const accessToken = newToken(ACCESS_PREFIX);
  const refreshToken = newToken(REFRESH_PREFIX);
  const accessExpiresAt = new Date(now.getTime() + ACCESS_TTL_MS);
  const refreshExpiresAt = new Date(now.getTime() + REFRESH_TTL_MS);
  return {
    pair: {
      accessToken,
      refreshToken,
      accessExpiresAt: accessExpiresAt.toISOString(),
      refreshExpiresAt: refreshExpiresAt.toISOString(),
    } satisfies TokenPair,
    row: {
      accessTokenHash: hashToken(accessToken),
      refreshTokenHash: hashToken(refreshToken),
      accessExpiresAt,
      refreshExpiresAt,
    },
  };
}

/** Starts a session for a user who just proved who they are (OTP). */
export async function createMobileSession(
  userId: string,
  device: DeviceInfo,
  now = new Date(),
): Promise<TokenPair> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { sessionVersion: true },
  });
  const { pair, row } = freshTokens(now);
  await prisma.mobileSession.create({
    data: {
      userId,
      deviceName: device.name,
      platform: device.platform,
      appVersion: device.appVersion ?? null,
      sessionVersion: user.sessionVersion,
      ...row,
    },
  });
  return pair;
}

export type RefreshResult = { ok: true; tokens: TokenPair } | { ok: false };

/** Swaps a refresh token for a new pair. Any failure means the app must sign in again. */
export async function refreshMobileSession(
  refreshToken: string,
  now = new Date(),
): Promise<RefreshResult> {
  if (!refreshToken.startsWith(REFRESH_PREFIX)) return { ok: false };
  const hash = hashToken(refreshToken);
  const session = await prisma.mobileSession.findFirst({
    where: { OR: [{ refreshTokenHash: hash }, { previousRefreshHash: hash }] },
    include: { user: { select: { status: true, sessionVersion: true } } },
  });
  if (!session || session.revokedAt) return { ok: false };
  if (session.previousRefreshHash === hash) {
    // The token was already exchanged once: someone else holds a copy. End the session.
    await revokeSessionById(session.id, "refresh token reused", now);
    return { ok: false };
  }
  if (
    session.refreshExpiresAt <= now ||
    session.user.status === "DISABLED" ||
    session.user.sessionVersion !== session.sessionVersion
  ) {
    await revokeSessionById(session.id, "expired or invalidated", now);
    return { ok: false };
  }
  const { pair, row } = freshTokens(now);
  // Conditional on the old hash so two concurrent refreshes can't both succeed.
  const updated = await prisma.mobileSession.updateMany({
    where: { id: session.id, refreshTokenHash: hash, revokedAt: null },
    data: { ...row, previousRefreshHash: hash, lastSeenAt: now },
  });
  if (updated.count !== 1) return { ok: false };
  return { ok: true, tokens: pair };
}

export async function revokeSessionById(id: string, reason: string, now = new Date()) {
  await prisma.mobileSession.updateMany({
    where: { id, revokedAt: null },
    data: { revokedAt: now, revokedReason: reason },
  });
}

/** Ends every mobile session of a user (sign-out everywhere, suspension). */
export async function revokeUserSessions(userId: string, reason: string, now = new Date()) {
  await prisma.mobileSession.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: now, revokedReason: reason },
  });
}

export type MobileAuth = { sessionId: string; ctx: Ctx };

/** Reads `Authorization: Bearer <accessToken>`. Null when missing, unknown, expired or revoked. */
export async function getMobileAuth(
  req: Pick<Request, "headers">,
  now = new Date(),
): Promise<MobileAuth | null> {
  const header = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(\S+)$/i.exec(header);
  if (!m || !m[1].startsWith(ACCESS_PREFIX)) return null;
  const session = await prisma.mobileSession.findUnique({
    where: { accessTokenHash: hashToken(m[1]) },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          organizationId: true,
          status: true,
          sessionVersion: true,
          roles: { select: { role: true, regionId: true } },
        },
      },
    },
  });
  if (
    !session ||
    session.revokedAt ||
    session.accessExpiresAt <= now ||
    session.user.status === "DISABLED" ||
    session.user.sessionVersion !== session.sessionVersion
  )
    return null;
  if (now.getTime() - session.lastSeenAt.getTime() > SEEN_RESOLUTION_MS)
    await prisma.mobileSession.update({ where: { id: session.id }, data: { lastSeenAt: now } });
  const roles = session.user.roles.map((r) => ({ role: r.role, regionId: r.regionId }));
  return {
    sessionId: session.id,
    ctx: {
      orgId: session.user.organizationId,
      userId: session.user.id,
      email: session.user.email,
      roles,
      regionIds: scopedRegionIds(roles),
      isSuperAdmin: isSuperAdmin(roles),
    },
  };
}
