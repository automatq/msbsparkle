import { describe, expect, it, vi } from "vitest";

vi.mock("@/modules/db/client", () => ({ prisma: {} }));
const { setupSchema, verifySetupKey } = await import("./setup");

const valid = {
  companyName: "Acme Cleaning",
  supportEmail: "help@acme.test",
  adminName: "Ada",
  adminEmail: "ada@acme.test",
  adminPassword: "correct horse battery",
  region: null,
};

describe("setup key", () => {
  it("accepts only the exact AUTH_SECRET (whitespace around it is ignored)", () => {
    expect(verifySetupKey(" s3cret-value ", "s3cret-value")).toBe(true);
    expect(verifySetupKey("s3cret-valuE", "s3cret-value")).toBe(false);
    expect(verifySetupKey("", "s3cret-value")).toBe(false);
  });
  it("is never satisfied when AUTH_SECRET is missing", () => {
    expect(verifySetupKey("", "")).toBe(false);
    expect(verifySetupKey("anything", "")).toBe(false);
  });
});

describe("setup form validation", () => {
  it("accepts a minimal setup without a region", () => {
    expect(setupSchema.safeParse(valid).success).toBe(true);
  });
  it("requires a 12+ character admin password", () => {
    const r = setupSchema.safeParse({ ...valid, adminPassword: "short" });
    expect(!r.success && r.error.issues[0].message).toMatch(/12 characters/);
  });
  it("rejects invalid service areas and a tax name without a valid rate", () => {
    const region = {
      name: "Toronto",
      province: "ON",
      timezone: "America/Toronto",
      areas: "M5V 90210",
      taxName: "HST",
      taxRate: "abc",
    };
    const r = setupSchema.safeParse({ ...valid, region });
    const messages = !r.success ? r.error.issues.map((i) => i.message).join(" | ") : "";
    expect(messages).toMatch(/90210/);
    expect(messages).toMatch(/tax rate/);
  });
});
