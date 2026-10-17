import { visitSelect } from "@/modules/customer/api-views";
import { prisma } from "@/modules/db/client";
import { withApiCustomer } from "@/modules/shared/api/handlers";
import { fail, ok } from "@/modules/shared/api/response";

export function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withApiCustomer(req, async ({ customerId }) => {
    const visit = await prisma.job.findFirst({
      where: { id: (await params).id, customerId },
      select: visitSelect,
    });
    return visit ? ok(visit) : fail("NOT_FOUND", 404);
  });
}
