import { z } from "zod";
import { pauseSeriesAction } from "@/modules/customer/actions";
import { withApiCustomer } from "@/modules/shared/api/handlers";
import { fail, fromAction, jsonBody } from "@/modules/shared/api/response";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const schema = z.object({ from: date, until: date });

export function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withApiCustomer(req, async () => {
    const parsed = schema.safeParse(await jsonBody(req));
    if (!parsed.success) return fail("INVALID", 400, parsed.error.issues);
    return fromAction(
      await pauseSeriesAction((await params).id, parsed.data.from, parsed.data.until),
    );
  });
}
