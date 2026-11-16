import type { Metadata } from "next";
import { GiftCardForm } from "@/components/marketing/gift-card-form";

export const metadata: Metadata = {
  title: "Gift cards",
  description: "Give the gift of a clean home. Delivered by email, never expires.",
};

export default async function GiftCardsPage({ searchParams }: PageProps<"/gift-cards">) {
  const p = await searchParams;
  const status = typeof p.status === "string" ? p.status : "";
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-4xl font-semibold tracking-tight">Gift a clean home</h1>
      <p className="mt-2 text-lg text-muted-foreground">
        Perfect for new parents, new homeowners, or anyone who deserves a break.
      </p>
      {status === "success" ? (
        <p className="mt-6 rounded-xl border bg-emerald-50 p-4 text-sm text-emerald-900">
          Payment received. The gift card is on its way by email.
        </p>
      ) : null}
      {status === "cancelled" ? (
        <p className="mt-6 rounded-xl border bg-amber-50 p-4 text-sm text-amber-900">
          Checkout cancelled. No charge was made.
        </p>
      ) : null}
      <div className="mt-8 rounded-xl border p-6">
        <GiftCardForm />
      </div>
    </div>
  );
}
