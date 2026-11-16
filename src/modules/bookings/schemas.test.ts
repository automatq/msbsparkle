import { describe, expect, it } from "vitest";
import { quoteRequestSchema } from "@/modules/pricing/schemas";
import { addressSchema } from "./schemas";

const address = { line1: "1 Main St", city: "Austin" };
const quote = { serviceSlug: "standard", bedrooms: 2, bathrooms: 1, frequency: "ONE_TIME" };

describe("postal code length guards accept both countries", () => {
  it.each(["M5V 2T6", "M5V2T6", "90210", "90210-1234"])("address accepts %s", (postalCode) => {
    expect(addressSchema.safeParse({ ...address, postalCode }).success).toBe(true);
  });
  it.each(["M5V", "902", "90210", "90210-1234", "M5V 2T6"])("quote accepts %s", (postalCode) => {
    expect(quoteRequestSchema.safeParse({ ...quote, postalCode }).success).toBe(true);
  });
});
