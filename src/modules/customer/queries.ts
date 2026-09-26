import type { Ctx } from "@/modules/auth/session";
import { prisma } from "@/modules/db/client";

/**
 * The Customer row for the signed-in user. Guest checkouts create Customers without a userId;
 * the first magic-link sign-in with the same email claims them.
 */
export async function customerForCtx(ctx: Ctx) {
  const byUser = await prisma.customer.findFirst({ where: { userId: ctx.userId } });
  if (byUser) return byUser;
  const byEmail = await prisma.customer.findFirst({
    where: { organizationId: ctx.orgId, email: ctx.email.toLowerCase(), userId: null },
  });
  if (byEmail)
    return prisma.customer.update({ where: { id: byEmail.id }, data: { userId: ctx.userId } });
  const user = await prisma.user.findUniqueOrThrow({ where: { id: ctx.userId } });
  const [firstName, ...rest] = (user.name ?? user.email.split("@")[0]).split(" ");
  return prisma.customer.create({
    data: {
      organizationId: ctx.orgId,
      userId: ctx.userId,
      email: user.email.toLowerCase(),
      firstName: firstName || "Customer",
      lastName: rest.join(" ") || "",
      phone: user.phone,
      source: "portal",
    },
  });
}

export async function ownedJob(customerId: string, jobId: string) {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    include: {
      region: { include: { windows: { where: { active: true }, orderBy: { sortOrder: "asc" } } } },
      booking: true,
      activeQuote: true,
      review: true,
      assignments: { where: { status: "ACCEPTED" }, include: { cleaner: true } },
      charges: true,
      tips: true,
    },
  });
  if (!job || job.customerId !== customerId) return null;
  return job;
}

export async function ownedBooking(customerId: string, bookingId: string) {
  const b = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!b || b.customerId !== customerId) return null;
  return b;
}
