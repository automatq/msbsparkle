"use client";

import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { useState } from "react";
import { Button } from "@/components/ui/button";

const pk = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
const stripePromise = pk ? loadStripe(pk) : null;

export function CardStep({
  clientSecret,
  onConfirmed,
  onBack,
}: {
  clientSecret: string;
  onConfirmed: (setupIntentId: string) => Promise<void>;
  onBack: () => void;
}) {
  if (!stripePromise)
    return <p className="text-sm text-destructive">Stripe publishable key is missing.</p>;
  return (
    <Elements stripe={stripePromise} options={{ clientSecret, appearance: { theme: "stripe" } }}>
      <CardForm onConfirmed={onConfirmed} onBack={onBack} />
    </Elements>
  );
}

function CardForm({
  onConfirmed,
  onBack,
}: {
  onConfirmed: (setupIntentId: string) => Promise<void>;
  onBack: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setBusy(true);
    setError(null);
    const { error, setupIntent } = await stripe.confirmSetup({ elements, redirect: "if_required" });
    if (error || !setupIntent) {
      setError(error?.message ?? "Card setup failed.");
      setBusy(false);
      return;
    }
    await onConfirmed(setupIntent.id);
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <PaymentElement />
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <p className="text-xs text-muted-foreground">
        Your card is saved securely with Stripe and only charged after your clean is complete.
      </p>
      <div className="flex justify-between">
        <Button type="button" variant="outline" onClick={onBack} disabled={busy}>
          Back
        </Button>
        <Button type="submit" disabled={!stripe || busy}>
          {busy ? "Confirming…" : "Confirm booking"}
        </Button>
      </div>
    </form>
  );
}
