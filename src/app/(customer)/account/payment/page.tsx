import { StatusBadge } from "@/components/admin/ui";
import { AddCard } from "@/components/customer/add-card";
import { DefaultCardButton } from "@/components/customer/panels";
import { requireRole } from "@/modules/auth/session";
import { customerForCtx } from "@/modules/customer/queries";
import { prisma } from "@/modules/db/client";
import { isStripeConfigured } from "@/modules/payments/stripe";
import { formatCents } from "@/modules/shared/money";

export const dynamic = "force-dynamic";

export default async function PaymentPage() {
  const ctx = await requireRole("/login");
  const customer = await customerForCtx(ctx);
  const [cards, charges] = await Promise.all([
    prisma.paymentMethod.findMany({
      where: { customerId: customer.id, status: "ACTIVE" },
      orderBy: { createdAt: "desc" },
    }),
    prisma.charge.findMany({
      where: { customerId: customer.id },
      include: { job: { include: { booking: { include: { service: true } } } }, refunds: true },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
  ]);
  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h1 className="text-2xl font-semibold">Payment</h1>
        <p className="text-sm text-muted-foreground">
          Your card is charged after each visit is completed. Nothing is charged up front.
        </p>
        <ul className="space-y-2 text-sm">
          {cards.map((c) => (
            <li key={c.id} className="flex items-center justify-between rounded-xl border p-3">
              <span>
                {c.brand} •••• {c.last4} · exp {c.expMonth}/{c.expYear}
                {customer.defaultPaymentMethodId === c.id ? (
                  <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs">default</span>
                ) : null}
              </span>
              {customer.defaultPaymentMethodId !== c.id ? (
                <DefaultCardButton paymentMethodId={c.id} />
              ) : null}
            </li>
          ))}
          {cards.length === 0 ? <li className="text-muted-foreground">No card on file.</li> : null}
        </ul>
        <AddCard configured={isStripeConfigured()} />
      </section>
      <section className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">Receipts</h2>
        <ul className="divide-y rounded-xl border text-sm">
          {charges.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-2 p-3">
              <span>
                {c.createdAt.toLocaleDateString("en-CA")} ·{" "}
                {c.type === "SERVICE"
                  ? (c.job?.booking.service.name ?? "Cleaning")
                  : c.type.replaceAll("_", " ").toLowerCase()}
                {c.job ? ` · ${c.job.booking.bookingNumber}` : ""}
              </span>
              <span className="flex items-center gap-2">
                <span>{formatCents(c.amountCents)}</span>
                <StatusBadge status={c.status} />
              </span>
            </li>
          ))}
          {charges.length === 0 ? (
            <li className="p-3 text-muted-foreground">No charges yet.</li>
          ) : null}
        </ul>
      </section>
    </div>
  );
}
