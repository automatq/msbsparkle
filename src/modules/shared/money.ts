/** All money is integer cents. bps = basis points (10000 = 100%). */

export function bpsOf(cents: number, bps: number): number {
  return Math.round((cents * bps) / 10000);
}

export function formatCents(
  cents: number,
  opts: { currency?: string; locale?: string } = {},
): string {
  const { currency = "CAD", locale = "en-CA" } = opts;
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
  }).format(cents / 100);
}

export function assertCents(value: number, label = "amount"): void {
  if (!Number.isInteger(value)) {
    throw new Error(`${label} must be integer cents, got ${value}`);
  }
}
