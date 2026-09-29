import { redirect } from "next/navigation";
import { requireRole } from "@/modules/auth/session";
import { customerForCtx } from "@/modules/customer/queries";
import { prisma } from "@/modules/db/client";

export const dynamic = "force-dynamic";

/** Prefills the public wizard from the customer's most recent booking. */
export default async function RebookPage() {
  const ctx = await requireRole("/login");
  const customer = await customerForCtx(ctx);
  const last = await prisma.booking.findFirst({
    where: { customerId: customer.id },
    include: { address: true, service: true },
    orderBy: { createdAt: "desc" },
  });
  if (!last) redirect("/book");
  const q = new URLSearchParams({
    postal: last.address.postalCode,
    service: last.service.slug,
    bedrooms: String(last.bedrooms),
    bathrooms: last.bathrooms.toString(),
    frequency: "ONE_TIME",
  });
  redirect(`/book?${q.toString()}`);
}
