import { describe, expect, it } from "vitest";

import { bookingNumberPrefix, generateBookingNumber } from "./booking-number";

describe("bookingNumberPrefix", () => {
  it("uses the configured prefix, cleaned and capped at 4 characters", () => {
    expect(bookingNumberPrefix("acme", "Whatever")).toBe("ACME");
    expect(bookingNumberPrefix(" a-c-m-e-x ", "Whatever")).toBe("ACME");
  });

  it("derives initials from the brand name", () => {
    expect(bookingNumberPrefix(undefined, "MSB Sparkle")).toBe("MS");
    expect(bookingNumberPrefix(undefined, "Acme Home Cleaning")).toBe("AHC");
    expect(bookingNumberPrefix(undefined, "Bright & Shiny Maids of Texas")).toBe("BSM");
    expect(bookingNumberPrefix(undefined, "Sparkly")).toBe("SP");
    expect(bookingNumberPrefix(undefined, "Ménage Éclat")).toBe("ME");
  });

  it("falls back when nothing usable is left", () => {
    expect(bookingNumberPrefix("", "")).toBe("BK");
    expect(bookingNumberPrefix("--", "★★★")).toBe("BK");
  });
});

describe("generateBookingNumber", () => {
  it("is the prefix plus 6 unambiguous characters", () => {
    expect(generateBookingNumber()).toMatch(/^[A-Z0-9]{1,4}-[A-HJ-NP-Z2-9]{6}$/);
  });
});
