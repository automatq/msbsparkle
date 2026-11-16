import { describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ headers: vi.fn() }));
vi.mock("@/modules/db/client", () => ({ prisma: {} }));

const { pickClientIp } = await import("./rate-limit");
const h = (o: Record<string, string>) => new Headers(o);

describe("pickClientIp", () => {
  it("on Vercel ignores a spoofed X-Forwarded-For", () => {
    expect(
      pickClientIp(h({ "x-forwarded-for": "6.6.6.6", "x-vercel-forwarded-for": "1.2.3.4" }), true),
    ).toBe("1.2.3.4");
  });

  it("elsewhere uses the right-most X-Forwarded-For hop added by our proxy", () => {
    expect(pickClientIp(h({ "x-forwarded-for": "6.6.6.6, 1.2.3.4" }), false)).toBe("1.2.3.4");
    expect(pickClientIp(h({ "x-real-ip": "5.5.5.5", "x-forwarded-for": "6.6.6.6" }), false)).toBe(
      "5.5.5.5",
    );
  });

  it("falls back to a shared bucket when no address is known", () => {
    expect(pickClientIp(h({}), false)).toBe("unknown");
  });
});
