import { goEnRoute } from "@/modules/cleaner/service";
import { cleanerRoute, fromResult } from "@/modules/mobile-api/http";

export const runtime = "nodejs";

export const POST = cleanerRoute<{ id: string }>(async ({ actor, params }) =>
  fromResult(await goEnRoute(actor, params.id)),
);
