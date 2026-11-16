import { describe, expect, it, vi } from "vitest";

vi.mock("@/modules/db/client", () => ({ prisma: {} }));

const { isValidTimezone, parseAreaPrefixes, slugify, validateNewRegion, RegionInputError } =
  await import("./manage");
const { COUNTRIES } = await import("@/modules/shared/country");

describe("parseAreaPrefixes", () => {
  it("accepts FSAs in any case and separator, de-duplicated", () => {
    expect(parseAreaPrefixes("m5v, M5W\nm6a;m5v", COUNTRIES.CA)).toEqual({
      valid: ["M5V", "M5W", "M6A"],
      invalid: [],
    });
  });
  it("reports tokens that are not valid for the country", () => {
    expect(parseAreaPrefixes("M5V 90210 M5", COUNTRIES.CA)).toEqual({
      valid: ["M5V"],
      invalid: ["90210", "M5"],
    });
    expect(parseAreaPrefixes("78701 787 7870 M5V", COUNTRIES.US)).toEqual({
      valid: ["78701", "787"],
      invalid: ["7870", "M5V"],
    });
  });
});

describe("region helpers", () => {
  it("slugifies names, including accents", () => {
    expect(slugify("Saint-Jérôme / Laurentides")).toBe("saint-jerome-laurentides");
    expect(slugify("  !!  ")).toBe("region");
  });
  it("validates IANA timezones", () => {
    expect(isValidTimezone("America/Chicago")).toBe(true);
    expect(isValidTimezone("Mars/Olympus")).toBe(false);
  });
  it("rejects a province or state from the wrong country", () => {
    const base = { name: "Austin", timezone: "America/Chicago" };
    expect(() => validateNewRegion({ ...base, province: "TX" }, COUNTRIES.US)).not.toThrow();
    expect(() => validateNewRegion({ ...base, province: "ON" }, COUNTRIES.US)).toThrow(
      RegionInputError,
    );
    expect(() => validateNewRegion({ ...base, province: "" }, COUNTRIES.CA)).toThrow(/province/);
  });
});
