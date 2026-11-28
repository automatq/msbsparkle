"use client";

import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { ArrowRight } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

const pk = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
const stripePromise = pk ? loadStripe(pk) : null;

export function CardStep({
  clientSecret,
  onConfirmed,
}: {
  clientSecret: string;
  onConfirmed: (setupIntentId: string) => Promise<void>;
  /** Unused: the wizard's own back link leads back. */
  onBack?: () => void;
}) {
  if (!stripePromise)
    return <p className="text-sm text-destructive">Stripe publishable key is missing.</p>;
  return (
    <Elements stripe={stripePromise} options={{ clientSecret, appearance: APPEARANCE }}>
      <CardForm onConfirmed={onConfirmed} />
    </Elements>
  );
}

/** Stripe's fields drawn like ours: filled, no outline, the same corners (globals.css). */
const APPEARANCE = {
  theme: "flat" as const,
  variables: {
    colorPrimary: "#0c0c0d",
    colorBackground: "#f4f4f4",
    colorText: "#0c0c0d",
    borderRadius: "12px",
    spacingUnit: "4px",
  },
};

function CardForm({ onConfirmed }: { onConfirmed: (setupIntentId: string) => Promise<void> }) {
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
      <p className="text-sm text-muted-foreground">
        Your card is saved securely with Stripe and only charged after your clean is complete.
      </p>
      <Button
        type="submit"
        disabled={!stripe || busy}
        className="h-16 w-full justify-between rounded-3xl px-6 text-lg"
      >
        <span className="wide font-semibold">{busy ? "Confirming…" : "Confirm booking"}</span>
        <ArrowRight className="size-5" aria-hidden />
      </Button>
    </form>
  );
}
