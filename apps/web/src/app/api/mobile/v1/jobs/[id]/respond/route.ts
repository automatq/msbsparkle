import { respondBody } from "@msb/shared/mobile-api";
import { respondToOffer } from "@/modules/cleaner/service";
import { cleanerRoute, fromResult, parseJson } from "@/modules/mobile-api/http";

export const runtime = "nodejs";

export const POST = cleanerRoute<{ id: string }>(async ({ req, actor, params }) => {
  const body = await parseJson(req, respondBody);
  if ("response" in body) return body.response;
  return fromResult(await respondToOffer(actor, params.id, body.data.accept));
});
