import { z } from "zod";
import { finishAddCardAction } from "@/modules/customer/actions";
import { withApiCustomer } from "@/modules/shared/api/handlers";
import { fail, fromAction, jsonBody } from "@/modules/shared/api/response";

const schema = z.object({ setupIntentId: z.string().min(1) });

/** Call after Stripe confirms the SetupIntent; saves the card and makes it the default. */
export function POST(req: Request) {
  return withApiCustomer(req, async () => {
    const parsed = schema.safeParse(await jsonBody(req));
    if (!parsed.success) return fail("INVALID", 400, parsed.error.issues);
    return fromAction(await finishAddCardAction(parsed.data.setupIntentId));
  });
}
