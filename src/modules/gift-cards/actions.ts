"use server";

import { z } from "zod";
import { prisma } from "@/modules/db/client";
import { lookupGiftCard, startGiftCardPurchase } from "./service";

const schema = z.object({
  amountCents: z.number().int().min(2500).max(100_000),
  purchaserEmail: z.string().email(),
  recipientEmail: z.string().email().optional().or(z.literal("")),
  message: z.string().max(400).optional(),
});

export async function buyGiftCardAction(raw: unknown) {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { ok: false as const, message: "Check the amount and email." };
  const org = await prisma.organization.findFirstOrThrow({ select: { id: true } });
  return startGiftCardPurchase(org.id, {
    ...parsed.data,
    recipientEmail: parsed.data.recipientEmail || null,
  });
}

export async function checkGiftCardAction(
  code: string,
): Promise<{ ok: true; balanceCents: number; code: string } | { ok: false; message: string }> {
  const card = await lookupGiftCard(code);
  if (!card) return { ok: false, message: "That gift card isn't valid or has no balance." };
  return { ok: true, balanceCents: card.balanceCents, code: card.code };
}
