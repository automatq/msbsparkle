import { describe, expect, it, vi } from "vitest";

vi.mock("@/modules/db/client", () => ({ prisma: {} }));
const { parseRatePercent } = await import("./tax-admin");

describe("parseRatePercent", () => {
  it("converts percentages to basis points", () => {
    expect(parseRatePercent("13")).toBe(1300);
    expect(parseRatePercent("13%")).toBe(1300);
    expect(parseRatePercent(" 4.712 % ")).toBe(471);
    expect(parseRatePercent("0.5")).toBe(50);
  });
  it("rejects zero, negative, over 30% and junk", () => {
    for (const bad of ["0", "-5", "31", "abc", "", "1.2345"])
      expect(parseRatePercent(bad)).toBeNull();
  });
});
