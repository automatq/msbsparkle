import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/modules/db/client";

/**
 * API keys for the read-only REST API. A key is "sk_" + 32 random bytes (base64url); only its
 * SHA-256 is stored, so a database leak doesn't expose usable keys. The full key is shown once.
 */
export const KEY_PREFIX = "sk_";
const DISPLAY_CHARS = 10;
export const MAX_ACTIVE_KEYS = 20;

export function generateApiKey(): string {
  return KEY_PREFIX + randomBytes(32).toString("base64url");
}

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/** The bearer key from an Authorization header, or null if it isn't one of ours. */
export function bearerKey(header: string | null): string | null {
  const m = header?.match(/^Bearer\s+(\S+)\s*$/i);
  const key = m?.[1];
  return key && key.startsWith(KEY_PREFIX) && key.length >= 40 && key.length <= 100 ? key : null;
}

export class ApiKeyError extends Error {}

export async function createApiKey(
  orgId: string,
  name: string,
  createdByUserId: string | null,
): Promise<{ key: string; id: string }> {
  const clean = name.trim().slice(0, 80);
  if (!clean) throw new ApiKeyError("Give the key a name, e.g. the app that will use it.");
  const active = await prisma.apiKey.count({ where: { organizationId: orgId, revokedAt: null } });
  if (active >= MAX_ACTIVE_KEYS)
    throw new ApiKeyError(`You can have up to ${MAX_ACTIVE_KEYS} active keys. Revoke one first.`);
  const key = generateApiKey();
  const row = await prisma.apiKey.create({
    data: {
      organizationId: orgId,
      name: clean,
      prefix: key.slice(0, DISPLAY_CHARS),
      keyHash: hashApiKey(key),
      createdByUserId,
    },
  });
  return { key, id: row.id };
}

export async function revokeApiKey(orgId: string, id: string): Promise<void> {
  const { count } = await prisma.apiKey.updateMany({
    where: { id, organizationId: orgId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (!count) throw new ApiKeyError("Key not found or already revoked.");
}

export type ApiAuth = { keyId: string; organizationId: string };

/** Resolves an Authorization header to an active key. Records use at most once a minute. */
export async function authenticateApiKey(header: string | null): Promise<ApiAuth | null> {
  const key = bearerKey(header);
  if (!key) return null;
  const row = await prisma.apiKey.findUnique({
    where: { keyHash: hashApiKey(key) },
    select: { id: true, organizationId: true, revokedAt: true, lastUsedAt: true },
  });
  if (!row || row.revokedAt) return null;
  if (!row.lastUsedAt || Date.now() - row.lastUsedAt.getTime() > 60_000)
    await prisma.apiKey
      .update({ where: { id: row.id }, data: { lastUsedAt: new Date() } })
      .catch(() => {});
  return { keyId: row.id, organizationId: row.organizationId };
}
