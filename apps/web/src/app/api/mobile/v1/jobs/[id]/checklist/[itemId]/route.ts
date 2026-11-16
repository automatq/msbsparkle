import { checklistBody } from "@msb/shared/mobile-api";
import { setChecklistItem } from "@/modules/cleaner/service";
import { cleanerRoute, fromResult, parseJson } from "@/modules/mobile-api/http";

export const runtime = "nodejs";

/** Idempotent: sets the item to `done`, so retries are safe. */
export const PUT = cleanerRoute<{ id: string; itemId: string }>(async ({ req, actor, params }) => {
  const body = await parseJson(req, checklistBody);
  if ("response" in body) return body.response;
  return fromResult(await setChecklistItem(actor, params.id, params.itemId, body.data.done));
});
