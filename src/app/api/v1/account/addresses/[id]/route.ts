import { z } from "zod";
import { updateAddressNotesAction } from "@/modules/customer/actions";
import { withApiCustomer } from "@/modules/shared/api/handlers";
import { fail, fromAction, jsonBody } from "@/modules/shared/api/response";

const schema = z.object({
  entryInstructions: z.string().trim().max(500).default(""),
  parkingInstructions: z.string().trim().max(300).default(""),
  pets: z.string().trim().max(200).default(""),
});

export function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withApiCustomer(req, async () => {
    const parsed = schema.safeParse(await jsonBody(req));
    if (!parsed.success) return fail("INVALID", 400, parsed.error.issues);
    return fromAction(await updateAddressNotesAction((await params).id, parsed.data));
  });
}
