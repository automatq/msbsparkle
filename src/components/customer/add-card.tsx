"use client";

import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { finishAddCardAction, startAddCardAction } from "@/modules/customer/actions";

const pk = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
const stripePromise = pk ? loadStripe(pk) : null;

export function AddCard({ configured }: { configured: boolean }) {
  const [secret, setSecret] = useState<string | null>(null);
  if (!configured || !stripePromise)
    return (
      <p className="text-sm text-muted-foreground">
        Card management is not available in this environment.
      </p>
    );
  if (!secret) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={async () => {
          const r = await startAddCardAction();
          if (r.ok) setSecret(r.clientSecret);
          else toast.error(r.message);
        }}
      >
        Add a card
      </Button>
    );
  }
  return (
    <Elements
      stripe={stripePromise}
      options={{ clientSecret: secret, appearance: { theme: "stripe" } }}
    >
      <Form onDone={() => setSecret(null)} />
    </Elements>
  );
}

function Form({ onDone }: { onDone: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!stripe || !elements) return;
        setBusy(true);
        const { error, setupIntent } = await stripe.confirmSetup({
          elements,
          redirect: "if_required",
        });
        if (error || !setupIntent) {
          toast.error(error?.message ?? "Card setup failed");
          setBusy(false);
          return;
        }
        const res = await finishAddCardAction(setupIntent.id);
        setBusy(false);
        if (res.ok) {
          toast.success(res.message);
          onDone();
          router.refresh();
        } else toast.error(res.message);
      }}
    >
      <PaymentElement />
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={!stripe || busy}>
          {busy ? "Saving…" : "Save card"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
