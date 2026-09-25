import { describe, expect, it } from "vitest";
import { bpsOf, formatCents } from "./money";

describe("bpsOf", () => {
  it("applies basis points with half-up rounding", () => {
    expect(bpsOf(10000, 1300)).toBe(1300);
    expect(bpsOf(9999, 1300)).toBe(1300); // 1299.87 -> 1300
    expect(bpsOf(24900, 1500)).toBe(3735);
    expect(bpsOf(1, 500)).toBe(0);
  });
});

describe("formatCents", () => {
  it("formats CAD", () => {
    expect(formatCents(12345)).toBe("$123.45");
  });
});
