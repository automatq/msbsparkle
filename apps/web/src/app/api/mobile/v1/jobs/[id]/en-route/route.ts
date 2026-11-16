import { positionBody } from "@msb/shared/mobile-api";
import { goEnRoute } from "@/modules/cleaner/service";
import { cleanerRoute, fromResult, parseJson } from "@/modules/mobile-api/http";

export const runtime = "nodejs";

/** Starts live tracking. Send the current position so the customer gets an ETA right away. */
export const POST = cleanerRoute<{ id: string }>(async ({ req, actor, params }) => {
  const body = await parseJson(req, positionBody);
  if ("response" in body) return body.response;
  return fromResult(await goEnRoute(actor, params.id, body.data.position));
});
