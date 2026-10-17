import { applyPlanEditAction } from "@/modules/customer/actions";
import { seriesChangesSchema } from "@/modules/customer/api-schemas";
import { withApiCustomer } from "@/modules/shared/api/handlers";
import { fail, fromAction, jsonBody } from "@/modules/shared/api/response";

export function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withApiCustomer(req, async () => {
    const parsed = seriesChangesSchema.safeParse(await jsonBody(req));
    if (!parsed.success) return fail("INVALID", 400, parsed.error.issues);
    return fromAction(await applyPlanEditAction((await params).id, parsed.data));
  });
}
