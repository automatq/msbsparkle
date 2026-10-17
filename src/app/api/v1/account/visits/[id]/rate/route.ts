import { z } from "zod";
import { rateVisitAction } from "@/modules/customer/actions";
import { withApiCustomer } from "@/modules/shared/api/handlers";
import { fail, fromAction, jsonBody } from "@/modules/shared/api/response";

const schema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(1000).optional(),
  tipCents: z.number().int().min(0).max(50_000).default(0),
});

export function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withApiCustomer(req, async () => {
    const parsed = schema.safeParse(await jsonBody(req));
    if (!parsed.success) return fail("INVALID", 400, parsed.error.issues);
    return fromAction(await rateVisitAction((await params).id, parsed.data));
  });
}
