import { resumeSeriesAction } from "@/modules/customer/actions";
import { withApiCustomer } from "@/modules/shared/api/handlers";
import { fromAction } from "@/modules/shared/api/response";

export function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withApiCustomer(req, async () => fromAction(await resumeSeriesAction((await params).id)));
}
