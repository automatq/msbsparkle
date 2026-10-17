import { prisma } from "@/modules/db/client";
import { withApiCustomer } from "@/modules/shared/api/handlers";
import { ok } from "@/modules/shared/api/response";

export function POST(req: Request) {
  return withApiCustomer(req, async (ctx) => {
    await prisma.user.update({
      where: { id: ctx.userId },
      data: { sessionVersion: { increment: 1 } },
    });
    return ok({ loggedOut: true });
  });
}
