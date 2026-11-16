import { randomInt } from "node:crypto";

import { brandName } from "@/modules/shared/site";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/**
 * Prefix for booking numbers: BOOKING_NUMBER_PREFIX if set, else the company's initials
 * ("Acme Home Cleaning" -> "AHC", "Sparkly" -> "SP"). Letters and digits only, 1-4 characters.
 */
export function bookingNumberPrefix(
  configured = process.env.BOOKING_NUMBER_PREFIX,
  brand = brandName,
): string {
  const clean = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const fromEnv = clean(configured ?? "").slice(0, 4);
  if (fromEnv) return fromEnv;

  const words = brand
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);
  const initials =
    words.length > 1 ? words.map((w) => w[0]).join("") : (words[0] ?? "").slice(0, 2);
  return clean(initials).slice(0, 3) || "BK";
}

export function generateBookingNumber(): string {
  let s = "";
  for (let i = 0; i < 6; i++) s += ALPHABET[randomInt(ALPHABET.length)];
  return `${bookingNumberPrefix()}-${s}`;
}
