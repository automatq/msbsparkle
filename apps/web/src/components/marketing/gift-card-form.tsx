"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { buyGiftCardAction } from "@/modules/gift-cards/actions";

const AMOUNTS = [5000, 10000, 15000, 20000, 30000];

export function GiftCardForm() {
  const [amount, setAmount] = useState(10000);
  const [v, setV] = useState({ purchaserEmail: "", recipientEmail: "", message: "" });
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (result)
    return (
      <p
        className="rounded-xl border bg-emerald-50 p-4 text-sm text-emerald-900"
        data-testid="gift-issued"
      >
        Gift card issued and emailed. Code: <span className="font-mono">{result}</span>
      </p>
    );
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await buyGiftCardAction({ amountCents: amount, ...v });
          if (!r.ok) setError(r.message);
          else if ("checkoutUrl" in r) window.location.href = r.checkoutUrl;
          else setResult(r.issuedCode);
        });
      }}
    >
      <div>
        <Label>Amount</Label>
        <div className="mt-2 flex flex-wrap gap-2">
          {AMOUNTS.map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => setAmount(a)}
              className={`rounded-full border px-4 py-1.5 text-sm ${amount === a ? "border-primary bg-primary text-primary-foreground" : ""}`}
              data-testid={`gift-${a}`}
            >
              ${a / 100}
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="g-from">Your email</Label>
        <Input
          id="g-from"
          type="email"
          value={v.purchaserEmail}
          onChange={(e) => setV({ ...v, purchaserEmail: e.target.value })}
          required
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="g-to">Recipient email (optional, otherwise sent to you)</Label>
        <Input
          id="g-to"
          type="email"
          value={v.recipientEmail}
          onChange={(e) => setV({ ...v, recipientEmail: e.target.value })}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="g-msg">Message (optional)</Label>
        <Textarea
          id="g-msg"
          value={v.message}
          onChange={(e) => setV({ ...v, message: e.target.value })}
          rows={2}
        />
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "…" : `Buy $${amount / 100} gift card`}
      </Button>
      <p className="text-xs text-muted-foreground">
        Delivered by email instantly. Never expires. Redeemable on any service at checkout; unused
        balance stays on the card.
      </p>
    </form>
  );
}
