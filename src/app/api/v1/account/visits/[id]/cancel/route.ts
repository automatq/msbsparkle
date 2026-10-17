import { z } from "zod";
import { cancelVisitAction } from "@/modules/customer/actions";
import { withApiCustomer } from "@/modules/shared/api/handlers";
import { fail, fromAction, jsonBody } from "@/modules/shared/api/response";

const schema = z.object({ reason: z.string().trim().max(500).default("") });

export function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withApiCustomer(req, async () => {
    const parsed = schema.safeParse((await jsonBody(req)) ?? {});
    if (!parsed.success) return fail("INVALID", 400, parsed.error.issues);
    return fromAction(await cancelVisitAction((await params).id, parsed.data.reason));
  });
}
