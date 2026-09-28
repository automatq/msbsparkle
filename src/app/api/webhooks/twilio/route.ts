import { createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "@/modules/db/client";
import { normalizePhone } from "@/modules/notifications/sms";

export const runtime = "nodejs";

/** Twilio request signature: HMAC-SHA1 of URL + sorted POST params, base64. */
function validSignature(
  url: string,
  params: Record<string, string>,
  signature: string | null,
): boolean {
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!token) return process.env.NODE_ENV !== "production";
  if (!signature) return false;
  const data =
    url +
    Object.keys(params)
      .sort()
      .map((k) => k + params[k])
      .join("");
  const expected = createHmac("sha1", token).update(data).digest("base64");
  return (
    expected.length === signature.length &&
    timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
  );
}

/** Inbound SMS: STOP/START keywords toggle SMS opt-out for the matching customer(s). */
export async function POST(req: Request) {
  const form = await req.formData();
  const params: Record<string, string> = {};
  form.forEach((v, k) => (params[k] = String(v)));
  const url = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/webhooks/twilio`;
  if (!validSignature(url, params, req.headers.get("x-twilio-signature")))
    return new Response("invalid signature", { status: 403 });

  const from = normalizePhone(params.From ?? "");
  const body = (params.Body ?? "").trim().toUpperCase();
  if (from) {
    const optOut = ["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"].includes(body);
    const optIn = ["START", "YES", "UNSTOP"].includes(body);
    if (optOut || optIn) {
      await prisma.customer.updateMany({
        where: { phone: { in: [from, from.replace("+1", "")] } },
        data: { smsOptOut: optOut },
      });
    }
  }
  return new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
    headers: { "content-type": "text/xml" },
  });
}
