import { previewPlanEditAction } from "@/modules/customer/actions";
import { seriesChangesSchema } from "@/modules/customer/api-schemas";
import { withApiCustomer } from "@/modules/shared/api/handlers";
import { fail, jsonBody, ok } from "@/modules/shared/api/response";

export function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withApiCustomer(req, async () => {
    const parsed = seriesChangesSchema.safeParse(await jsonBody(req));
    if (!parsed.success) return fail("INVALID", 400, parsed.error.issues);
    const r = await previewPlanEditAction((await params).id, parsed.data);
    return r.ok ? ok(r.preview) : fail("ACTION_FAILED", 422, { message: r.message });
  });
}
