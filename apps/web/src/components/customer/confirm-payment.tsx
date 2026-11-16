"use client";

import { loadStripe } from "@stripe/stripe-js";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  finishPaymentConfirmationAction,
  startPaymentConfirmationAction,
} from "@/modules/customer/payment-actions";

const pk = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
const stripePromise = pk ? loadStripe(pk) : null;

/** Lets the customer complete a payment their bank flagged for 3D Secure. */
export function ConfirmPayment({ chargeId, label }: { chargeId: string; label: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  if (!stripePromise)
    return <p className="text-sm text-muted-foreground">Payments are not available right now.</p>;

  async function confirm() {
    setBusy(true);
    try {
      const start = await startPaymentConfirmationAction(chargeId);
      if (!start.ok) {
        toast.error(start.message);
        return;
      }
      const stripe = await stripePromise;
      if (!stripe) throw new Error("Could not load the payment form.");
      const { error } = await stripe.confirmCardPayment(
        start.clientSecret,
        start.paymentMethodId ? { payment_method: start.paymentMethodId } : undefined,
      );
      const done = await finishPaymentConfirmationAction(chargeId);
      if (error) toast.error(error.message ?? "The payment was not confirmed.");
      else if (done.ok && done.paid) toast.success("Payment confirmed. Thank you!");
      else toast.error(done.ok ? "The payment was not confirmed." : done.message);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button onClick={confirm} disabled={busy} data-testid="confirm-payment">
      {busy ? "Confirming…" : label}
    </Button>
  );
}
