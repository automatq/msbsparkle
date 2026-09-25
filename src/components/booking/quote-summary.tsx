"use client";

import { formatCents } from "@/modules/shared/money";
import type { QuoteResult } from "@/modules/pricing/types";

export function QuoteSummary({
  quote,
  loading,
  serviceName,
}: {
  quote: QuoteResult | null;
  loading?: boolean;
  serviceName?: string;
}) {
  if (!quote) {
    return (
      <div className="rounded-xl border bg-muted/30 p-4 text-sm text-muted-foreground">
        {loading ? "Calculating your price…" : "Your price appears here as you go."}
      </div>
    );
  }
  const visible = quote.lines.filter((l) => l.amountCents !== 0 || l.step === "EXTRA");
  return (
    <div
      className={`rounded-xl border p-4 text-sm ${loading ? "opacity-60" : ""}`}
      data-testid="quote-summary"
    >
      {serviceName ? <p className="mb-2 font-medium">{serviceName}</p> : null}
      <ul className="space-y-1">
        {visible.map((l, i) => (
          <li key={`${l.step}-${l.key}-${i}`} className="flex justify-between gap-3">
            <span className="text-muted-foreground">
              {l.label}
              {l.qty > 1 && l.step === "EXTRA" ? ` × ${l.qty}` : ""}
            </span>
            <span className={l.amountCents < 0 ? "text-emerald-700" : ""}>
              {formatCents(l.amountCents)}
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex justify-between border-t pt-3 text-base font-semibold">
        <span>Total</span>
        <span data-testid="quote-total">{formatCents(quote.totalCents)}</span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        About {Math.round(quote.estimatedMinutes / 60)}h{" "}
        {quote.estimatedMinutes % 60 ? `${quote.estimatedMinutes % 60}m` : ""} of cleaning. Charged
        after the clean is complete.
      </p>
      {quote.warnings.map((w) => (
        <p key={w} className="mt-1 text-xs text-amber-700">
          {w}
        </p>
      ))}
    </div>
  );
}
