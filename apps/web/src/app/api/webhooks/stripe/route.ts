import { NextResponse } from "next/server";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/modules/db/client";
import { getStripe } from "@/modules/payments/stripe";
import { handleStripeEvent } from "@/modules/payments/webhooks";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret)
    return NextResponse.json({ error: "Stripe not configured" }, { status: 503 });

  const sig = req.headers.get("stripe-signature");
  const raw = await req.text();
  let event;
  try {
    event = stripe.webhooks.constructEvent(raw, sig ?? "", secret);
  } catch (e) {
    return NextResponse.json(
      { error: `Invalid signature: ${e instanceof Error ? e.message : "unknown"}` },
      { status: 400 },
    );
  }

  // Idempotency: the event id is the primary key.
  try {
    await prisma.stripeEvent.create({
      data: { id: event.id, type: event.type, payload: event as unknown as Prisma.InputJsonValue },
    });
  } catch {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    await handleStripeEvent(event);
    await prisma.stripeEvent.update({ where: { id: event.id }, data: { processedAt: new Date() } });
  } catch (e) {
    await prisma.stripeEvent.update({
      where: { id: event.id },
      data: { error: e instanceof Error ? e.message : String(e) },
    });
    return NextResponse.json({ error: "handler failed" }, { status: 500 });
  }
  return NextResponse.json({ received: true });
}
