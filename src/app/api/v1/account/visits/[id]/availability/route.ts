import { visitAvailabilityAction } from "@/modules/customer/actions";
import { withApiCustomer } from "@/modules/shared/api/handlers";
import { ok } from "@/modules/shared/api/response";

/** Open windows over the next 28 days for rescheduling this visit. */
export function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withApiCustomer(req, async () => ok(await visitAvailabilityAction((await params).id)));
}
