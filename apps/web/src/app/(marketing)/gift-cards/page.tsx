import type { Metadata } from "next";
import { GiftCardForm } from "@/components/marketing/gift-card-form";
import { PageIntro } from "@/components/marketing/page-intro";

export const metadata: Metadata = {
  title: "Gift cards",
  description: "Give the gift of a clean home. Delivered by email, never expires.",
};

export default async function GiftCardsPage({ searchParams }: PageProps<"/gift-cards">) {
  const p = await searchParams;
  const status = typeof p.status === "string" ? p.status : "";
  return (
    <div className="mx-auto max-w-6xl px-6">
      <PageIntro title="Gift a clean home">
        Perfect for new parents, new homeowners, or anyone who deserves a break.
      </PageIntro>
      {status === "success" ? (
        <p className="mt-8 font-medium text-success">
          Payment received. The gift card is on its way by email.
        </p>
      ) : null}
      {status === "cancelled" ? (
        <p className="mt-8 font-medium text-warning">Checkout cancelled. No charge was made.</p>
      ) : null}
      <div className="mt-12 max-w-2xl border-t border-foreground pt-8">
        <GiftCardForm />
      </div>
    </div>
  );
}
