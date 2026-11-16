/**
 * Country presets. A deployment serves one country, chosen at deploy time with
 * NEXT_PUBLIC_COUNTRY (CA or US). Everything locale-specific — postal codes, provinces/states,
 * currency, number formatting, phone numbers, default timezone — comes from here, so the rest of
 * the code never assumes a country.
 *
 * Safe to import from client components (no server-only dependencies).
 */

export type CountryCode = "CA" | "US";

export type NormalizedPostal = {
  /** Canonical full code ("M5V 2T6", "90210", "90210-1234"), or null when only an area was given. */
  postalCode: string | null;
  /** Service-area keys this code falls in, most specific first ("90210", "902"). */
  prefixes: string[];
};

export type CountryProfile = {
  code: CountryCode;
  name: string;
  currency: string;
  locale: string;
  defaultTimezone: string;
  timezones: string[];
  callingCode: string;
  postalLabel: string;
  postalPlaceholder: string;
  /** How a service-area prefix is described in the admin ("FSA", "ZIP prefix"). */
  areaLabel: string;
  areaHint: string;
  subdivisionLabel: string;
  subdivisions: { code: string; name: string }[];
  normalizePostal(input: string): NormalizedPostal | null;
  /** Validates and canonicalizes a service-area prefix typed by an admin. */
  normalizeAreaPrefix(input: string): string | null;
};

const compact = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");

const CA: CountryProfile = {
  code: "CA",
  name: "Canada",
  currency: "CAD",
  locale: "en-CA",
  defaultTimezone: "America/Toronto",
  timezones: [
    "America/St_Johns",
    "America/Halifax",
    "America/Toronto",
    "America/Winnipeg",
    "America/Regina",
    "America/Edmonton",
    "America/Vancouver",
    "America/Whitehorse",
  ],
  callingCode: "1",
  postalLabel: "Postal code",
  postalPlaceholder: "M5V 2T6",
  areaLabel: "FSA",
  areaHint: "First 3 characters of a postal code, e.g. M5V",
  subdivisionLabel: "Province",
  subdivisions: [
    { code: "AB", name: "Alberta" },
    { code: "BC", name: "British Columbia" },
    { code: "MB", name: "Manitoba" },
    { code: "NB", name: "New Brunswick" },
    { code: "NL", name: "Newfoundland and Labrador" },
    { code: "NS", name: "Nova Scotia" },
    { code: "NT", name: "Northwest Territories" },
    { code: "NU", name: "Nunavut" },
    { code: "ON", name: "Ontario" },
    { code: "PE", name: "Prince Edward Island" },
    { code: "QC", name: "Quebec" },
    { code: "SK", name: "Saskatchewan" },
    { code: "YT", name: "Yukon" },
  ],
  normalizePostal(input) {
    const raw = compact(input);
    if (/^[A-Z]\d[A-Z]\d[A-Z]\d$/.test(raw))
      return { postalCode: `${raw.slice(0, 3)} ${raw.slice(3)}`, prefixes: [raw.slice(0, 3)] };
    if (/^[A-Z]\d[A-Z]$/.test(raw)) return { postalCode: null, prefixes: [raw] };
    return null;
  },
  normalizeAreaPrefix(input) {
    const raw = compact(input);
    return /^[A-Z]\d[A-Z]$/.test(raw) ? raw : null;
  },
};

const US: CountryProfile = {
  code: "US",
  name: "United States",
  currency: "USD",
  locale: "en-US",
  defaultTimezone: "America/New_York",
  timezones: [
    "America/New_York",
    "America/Chicago",
    "America/Denver",
    "America/Phoenix",
    "America/Los_Angeles",
    "America/Anchorage",
    "Pacific/Honolulu",
  ],
  callingCode: "1",
  postalLabel: "ZIP code",
  postalPlaceholder: "90210",
  areaLabel: "ZIP prefix",
  areaHint: "A full 5-digit ZIP (90210) or a 3-digit ZIP prefix (902)",
  subdivisionLabel: "State",
  subdivisions: [
    ["AL", "Alabama"],
    ["AK", "Alaska"],
    ["AZ", "Arizona"],
    ["AR", "Arkansas"],
    ["CA", "California"],
    ["CO", "Colorado"],
    ["CT", "Connecticut"],
    ["DE", "Delaware"],
    ["DC", "District of Columbia"],
    ["FL", "Florida"],
    ["GA", "Georgia"],
    ["HI", "Hawaii"],
    ["ID", "Idaho"],
    ["IL", "Illinois"],
    ["IN", "Indiana"],
    ["IA", "Iowa"],
    ["KS", "Kansas"],
    ["KY", "Kentucky"],
    ["LA", "Louisiana"],
    ["ME", "Maine"],
    ["MD", "Maryland"],
    ["MA", "Massachusetts"],
    ["MI", "Michigan"],
    ["MN", "Minnesota"],
    ["MS", "Mississippi"],
    ["MO", "Missouri"],
    ["MT", "Montana"],
    ["NE", "Nebraska"],
    ["NV", "Nevada"],
    ["NH", "New Hampshire"],
    ["NJ", "New Jersey"],
    ["NM", "New Mexico"],
    ["NY", "New York"],
    ["NC", "North Carolina"],
    ["ND", "North Dakota"],
    ["OH", "Ohio"],
    ["OK", "Oklahoma"],
    ["OR", "Oregon"],
    ["PA", "Pennsylvania"],
    ["RI", "Rhode Island"],
    ["SC", "South Carolina"],
    ["SD", "South Dakota"],
    ["TN", "Tennessee"],
    ["TX", "Texas"],
    ["UT", "Utah"],
    ["VT", "Vermont"],
    ["VA", "Virginia"],
    ["WA", "Washington"],
    ["WV", "West Virginia"],
    ["WI", "Wisconsin"],
    ["WY", "Wyoming"],
  ].map(([code, name]) => ({ code, name })),
  normalizePostal(input) {
    const digits = input.replace(/\D/g, "");
    if (digits.length === 9)
      return {
        postalCode: `${digits.slice(0, 5)}-${digits.slice(5)}`,
        prefixes: [digits.slice(0, 5), digits.slice(0, 3)],
      };
    if (digits.length === 5) return { postalCode: digits, prefixes: [digits, digits.slice(0, 3)] };
    if (digits.length === 3 && /^\d{3}$/.test(input.trim()))
      return { postalCode: null, prefixes: [digits] };
    return null;
  },
  normalizeAreaPrefix(input) {
    const raw = input.trim();
    return /^\d{3}(\d{2})?$/.test(raw) ? raw : null;
  },
};

export const COUNTRIES: Record<CountryCode, CountryProfile> = { CA, US };

export function countryProfile(code: string | undefined | null): CountryProfile {
  return COUNTRIES[(code ?? "").toUpperCase() as CountryCode] ?? CA;
}

/** The deployment's country, currency and locale (NEXT_PUBLIC_* so it is inlined client-side). */
export const country: CountryProfile = countryProfile(process.env.NEXT_PUBLIC_COUNTRY);
export const currency: string = (
  process.env.NEXT_PUBLIC_CURRENCY || country.currency
).toUpperCase();
export const locale: string = process.env.NEXT_PUBLIC_LOCALE || country.locale;
/** Company-wide timezone for "today" in admin views, reports and the daily digest. */
export const timezone: string = process.env.NEXT_PUBLIC_TIMEZONE || country.defaultTimezone;

/** Normalizes a phone number to E.164, assuming the deployment's country for local numbers. */
export function normalizePhone(input: string, profile: CountryProfile = country): string | null {
  const digits = input.replace(/\D/g, "");
  const cc = profile.callingCode;
  // North American Numbering Plan (CA, US): 10 digits, optionally prefixed with 1.
  if (cc === "1") {
    if (digits.length === 10) return `+1${digits}`;
    if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  }
  if (input.trim().startsWith("+") && digits.length >= 8 && digits.length <= 15)
    return `+${digits}`;
  return null;
}

export function subdivisionName(code: string, profile: CountryProfile = country): string {
  return profile.subdivisions.find((s) => s.code === code)?.name ?? code;
}
