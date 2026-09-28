import { randomInt } from "node:crypto";
import { prisma } from "@/modules/db/client";
import { sendEmail } from "@/modules/notifications/email";
import { appUrl, brand } from "@/modules/notifications/send";
import { getStripe } from "@/modules/payments/stripe";
import { formatCents } from "@/modules/shared/money";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function code(): string {
  const part = () => Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
  return `GC-${part()}-${part()}-${part()}`;
}

export function normalizeGiftCode(input: string): string {
  return input
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .replace(/^GC/, "")
    .replace(/(.{4})(?=.)/g, "$1-")
    .replace(/^/, "GC-");
}

/** Creates a gift card, emails the recipient (or purchaser), returns the code. */
export async function issueGiftCard(input: {
  organizationId: string;
  amountCents: number;
  purchaserEmail: string;
  recipientEmail?: string | null;
  message?: string | null;
  purchaseChargeId?: string | null;
}) {
  const card = await prisma.giftCard.create({
    data: {
      organizationId: input.organizationId,
      code: code(),
      initialCents: input.amountCents,
      balanceCents: input.amountCents,
      purchaserEmail: input.purchaserEmail.toLowerCase(),
      recipientEmail: input.recipientEmail?.toLowerCase() || null,
      message: input.message || null,
      purchaseChargeId: input.purchaseChargeId ?? null,
    },
  });
  const to = card.recipientEmail ?? card.purchaserEmail;
  const text = `You've received a ${formatCents(card.initialCents)} ${brand()} gift card${card.recipientEmail ? ` from ${card.purchaserEmail}` : ""}.${card.message ? `\n\n"${card.message}"` : ""}\n\nCode: ${card.code}\nRedeem it at checkout: ${appUrl()}/book\nGift cards never expire.`;
  await sendEmail({
    to,
    subject: `Your ${formatCents(card.initialCents)} ${brand()} gift card`,
    text,
    html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto"><h1 style="font-size:20px">A ${formatCents(card.initialCents)} gift card for you</h1>${card.message ? `<p style="font-style:italic">"${card.message.replace(/</g, "&lt;")}"</p>` : ""}<p style="font-size:24px;letter-spacing:2px;font-family:monospace">${card.code}</p><p><a href="${appUrl()}/book">Redeem at checkout</a>. Gift cards never expire.</p></div>`,
    templateKey: "giftcard.issued",
    organizationId: input.organizationId,
    recipientType: "CUSTOMER",
    dedupeKey: `giftcard.issued:${card.id}`,
  }).catch((e) => console.error("gift card email failed", e));
  return card;
}

export type GiftPurchase = {
  amountCents: number;
  purchaserEmail: string;
  recipientEmail?: string | null;
  message?: string | null;
};

/** With Stripe: hosted Checkout session (webhook mints the card). Without: issue immediately (dev). */
export async function startGiftCardPurchase(
  organizationId: string,
  p: GiftPurchase,
): Promise<
  | { ok: true; checkoutUrl: string }
  | { ok: true; issuedCode: string }
  | { ok: false; message: string }
> {
  const stripe = getStripe();
  if (!stripe) {
    const card = await issueGiftCard({ organizationId, ...p });
    return { ok: true, issuedCode: card.code };
  }
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: p.purchaserEmail,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "cad",
          unit_amount: p.amountCents,
          product_data: { name: `${brand()} gift card` },
        },
      },
    ],
    metadata: {
      kind: "GIFT_CARD",
      organizationId,
      amountCents: String(p.amountCents),
      purchaserEmail: p.purchaserEmail,
      recipientEmail: p.recipientEmail ?? "",
      message: (p.message ?? "").slice(0, 400),
    },
    success_url: `${appUrl()}/gift-cards?status=success`,
    cancel_url: `${appUrl()}/gift-cards?status=cancelled`,
  });
  if (!session.url) return { ok: false, message: "Could not start checkout." };
  return { ok: true, checkoutUrl: session.url };
}

export async function lookupGiftCard(codeInput: string) {
  const c = normalizeGiftCode(codeInput);
  const card = await prisma.giftCard.findUnique({ where: { code: c } });
  if (!card || card.status !== "ACTIVE" || card.balanceCents <= 0) return null;
  return card;
}
