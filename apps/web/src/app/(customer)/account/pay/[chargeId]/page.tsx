import Link from "next/link";
import { notFound } from "next/navigation";
import { ConfirmPayment } from "@/components/customer/confirm-payment";
import { requireRole } from "@/modules/auth/session";
import { customerForCtx } from "@/modules/customer/queries";
import { prisma } from "@/modules/db/client";
import { formatCents } from "@/modules/shared/money";
import { formatInZone } from "@/modules/shared/dates";

export const dynamic = "force-dynamic";

export default async function ConfirmPaymentPage({ params }: PageProps<"/account/pay/[chargeId]">) {
  const { chargeId } = await params;
  const ctx = await requireRole("/login");
  const customer = await customerForCtx(ctx);
  const charge = await prisma.charge.findFirst({
    where: { id: chargeId, customerId: customer.id },
    include: { job: { include: { service: true } } },
  });
  if (!charge) notFound();
  const when = charge.job
    ? formatInZone(charge.job.scheduledStartAt, charge.job.timezone, "EEEE, MMMM d")
    : null;

  return (
    <div className="max-w-lg space-y-4">
      <h1 className="text-2xl font-semibold">Confirm your payment</h1>
      {charge.status === "REQUIRES_ACTION" ? (
        <>
          <p className="text-sm text-muted-foreground">
            Your bank asked you to confirm the {formatCents(charge.cardCents)} payment
            {charge.job ? ` for your ${charge.job.service.name.toLowerCase()} on ${when}` : ""}. You
            may be asked to approve it in your banking app.
          </p>
          <ConfirmPayment chargeId={charge.id} label={`Confirm ${formatCents(charge.cardCents)}`} />
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          {["CAPTURED", "PARTIALLY_REFUNDED", "REFUNDED"].includes(charge.status)
            ? "This payment is complete. Thank you!"
            : "This payment doesn't need confirming any more."}
        </p>
      )}
      <Link href="/account/payment" className="text-sm underline">
        Back to payment settings
      </Link>
    </div>
  );
}
