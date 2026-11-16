import { describe, expect, it } from "vitest";
import { COUNTRIES, countryProfile, normalizePhone } from "./country";

const { CA, US } = COUNTRIES;

describe("Canada", () => {
  it("normalizes full postal codes and FSAs", () => {
    expect(CA.normalizePostal("m5v2t6")).toEqual({ postalCode: "M5V 2T6", prefixes: ["M5V"] });
    expect(CA.normalizePostal(" M5V-2T6 ")).toEqual({ postalCode: "M5V 2T6", prefixes: ["M5V"] });
    expect(CA.normalizePostal("m5v")).toEqual({ postalCode: null, prefixes: ["M5V"] });
  });
  it("rejects anything that is not a Canadian code", () => {
    expect(CA.normalizePostal("90210")).toBeNull();
    expect(CA.normalizePostal("M5")).toBeNull();
  });
  it("accepts only FSAs as service areas", () => {
    expect(CA.normalizeAreaPrefix(" l4t ")).toBe("L4T");
    expect(CA.normalizeAreaPrefix("L4")).toBeNull();
  });
});

describe("United States", () => {
  it("normalizes ZIP and ZIP+4, most specific prefix first", () => {
    expect(US.normalizePostal("90210")).toEqual({
      postalCode: "90210",
      prefixes: ["90210", "902"],
    });
    expect(US.normalizePostal("90210-1234")).toEqual({
      postalCode: "90210-1234",
      prefixes: ["90210", "902"],
    });
    expect(US.normalizePostal("902")).toEqual({ postalCode: null, prefixes: ["902"] });
  });
  it("rejects malformed ZIPs and Canadian codes", () => {
    expect(US.normalizePostal("9021")).toBeNull();
    expect(US.normalizePostal("M5V 2T6")).toBeNull();
  });
  it("accepts ZIP5 and ZIP3 service areas", () => {
    expect(US.normalizeAreaPrefix("90210")).toBe("90210");
    expect(US.normalizeAreaPrefix("902")).toBe("902");
    expect(US.normalizeAreaPrefix("9021")).toBeNull();
  });
  it("uses US labels, currency and states", () => {
    expect(US.postalLabel).toBe("ZIP code");
    expect(US.currency).toBe("USD");
    expect(US.subdivisions.find((s) => s.code === "NY")?.name).toBe("New York");
  });
});

describe("shared helpers", () => {
  it("falls back to Canada for unknown country codes", () => {
    expect(countryProfile("us").code).toBe("US");
    expect(countryProfile(undefined).code).toBe("CA");
    expect(countryProfile("XX").code).toBe("CA");
  });
  it("normalizes North American phone numbers to E.164", () => {
    expect(normalizePhone("(416) 555-1000", CA)).toBe("+14165551000");
    expect(normalizePhone("1 212 555 0100", US)).toBe("+12125550100");
    expect(normalizePhone("+44 20 7946 0958", US)).toBe("+442079460958");
    expect(normalizePhone("555-1000", US)).toBeNull();
  });
});
