import { headers } from "next/headers";
import { prisma } from "@/modules/db/client";

export type LimitResult = { allowed: boolean; remaining: number; retryAfterSeconds: number };

/**
 * Fixed-window limiter on Postgres: one row per (scope, subject, window). Good enough to stop
 * abuse of quotes, sign-in codes and logins without adding Redis. Swap for Upstash if needed.
 */
export async function rateLimit(
  scope: string,
  subject: string,
  limit: number,
  windowSeconds: number,
  now = new Date(),
): Promise<LimitResult> {
  const windowMs = windowSeconds * 1000;
  const windowStart = new Date(Math.floor(now.getTime() / windowMs) * windowMs);
  const key = `${scope}:${subject}:${windowStart.getTime()}`;
  const row = await prisma.rateLimit.upsert({
    where: { key },
    update: { count: { increment: 1 } },
    create: { key, windowStart, count: 1 },
  });
  const retryAfterSeconds = Math.ceil((windowStart.getTime() + windowMs - now.getTime()) / 1000);
  return {
    allowed: row.count <= limit,
    remaining: Math.max(0, limit - row.count),
    retryAfterSeconds,
  };
}

export async function clientIp(): Promise<string> {
  const h = await headers();
  const xf = h.get("x-forwarded-for");
  return (xf ? xf.split(",")[0] : h.get("x-real-ip")) ?? "unknown";
}

export class RateLimitedError extends Error {
  constructor(public retryAfterSeconds: number) {
    super(`Too many requests. Try again in ${retryAfterSeconds}s.`);
  }
}

/** Throws when over the limit; use in server actions where a thrown message is surfaced to the user. */
export async function enforce(
  scope: string,
  subject: string,
  limit: number,
  windowSeconds: number,
): Promise<void> {
  const r = await rateLimit(scope, subject, limit, windowSeconds);
  if (!r.allowed) throw new RateLimitedError(r.retryAfterSeconds);
}

/** Deletes expired windows (called by the retention task). */
export async function pruneRateLimits(now = new Date()): Promise<number> {
  const res = await prisma.rateLimit.deleteMany({
    where: { windowStart: { lt: new Date(now.getTime() - 24 * 3600_000) } },
  });
  return res.count;
}
