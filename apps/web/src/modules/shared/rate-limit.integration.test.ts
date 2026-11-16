import { describe, expect, it } from "vitest";
import { pruneRateLimits, rateLimit } from "./rate-limit";

describe.skipIf(!process.env.DATABASE_URL)("rateLimit (integration)", () => {
  it("allows up to the limit in a window, then blocks, then resets in the next window", async () => {
    const subject = `test-${Date.now()}`;
    const now = new Date("2026-10-01T10:00:00Z");
    for (let i = 1; i <= 3; i++)
      expect((await rateLimit("t", subject, 3, 60, now)).allowed).toBe(true);
    const blocked = await rateLimit("t", subject, 3, 60, now);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    expect((await rateLimit("t", subject, 3, 60, new Date("2026-10-01T10:01:00Z"))).allowed).toBe(
      true,
    );
    expect(await pruneRateLimits(new Date("2026-10-03T00:00:00Z"))).toBeGreaterThanOrEqual(2);
  });
});
