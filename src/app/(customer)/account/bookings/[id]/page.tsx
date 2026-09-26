import Link from "next/link";
import { notFound } from "next/navigation";
import { StatusBadge } from "@/components/admin/ui";
import { SeriesControls } from "@/components/customer/panels";
import { requireRole } from "@/modules/auth/session";
import { customerForCtx } from "@/modules/customer/queries";
import { prisma } from "@/modules/db/client";
import { dateColumnToLocalDate } from "@/modules/shared/dates";
import { formatCents } from "@/modules/shared/money";

export const dynamic = "force-dynamic";

const FREQ: Record<string, string> = {
  ONE_TIME: "One-time",
  WEEKLY: "Weekly",
  BIWEEKLY: "Every 2 weeks",
  EVERY_4_WEEKS: "Every 4 weeks",
};

export default async function CustomerBookingPage({ params }: PageProps<"/account/bookings/[id]">) {
  const ctx = await requireRole("/login");
  const customer = await customerForCtx(ctx);
  const { id } = await params;
  const b = await prisma.booking.findUnique({
    where: { id },
    include: {
      service: true,
      window: true,
      address: true,
      region: true,
      paymentMethod: true,
      jobs: {
        orderBy: { sequenceNumber: "asc" },
        include: {
          activeQuote: true,
          assignments: { where: { status: "ACCEPTED" }, include: { cleaner: true } },
        },
      },
    },
  });
  if (!b || b.customerId !== customer.id) notFound();
  const extras = b.extras as { slug: string; qty: number }[];
  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs text-muted-foreground">
          <Link href="/account" className="hover:underline">
            Your bookings
          </Link>
        </p>
        <h1 className="flex items-center gap-3 text-2xl font-semibold">
          {b.service.name} <StatusBadge status={b.status} />
        </h1>
        <p className="text-sm text-muted-foreground">
          {FREQ[b.frequency]} · {b.window.label} · {b.bookingNumber}
        </p>
      </div>
      <div className="grid gap-6 md:grid-cols-3">
        <div className="space-y-2 md:col-span-2">
          <h2 className="text-sm font-medium text-muted-foreground">Visits</h2>
          <ul className="divide-y rounded-xl border text-sm">
            {b.jobs.map((j) => (
              <li key={j.id} className="flex items-center justify-between gap-2 p-3">
                <span>
                  {dateColumnToLocalDate(j.scheduledDate)} · {j.windowStartLocal}
                  {j.assignments.length
                    ? ` · ${j.assignments.map((a) => a.cleaner.firstName).join(", ")}`
                    : ""}
                </span>
                <span className="flex items-center gap-2">
                  <span>{formatCents(j.activeQuote?.totalCents ?? 0)}</span>
                  <StatusBadge status={j.status} />
                </span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">
            Reschedule or cancel individual visits from{" "}
            <Link href="/account" className="underline">
              your bookings
            </Link>
            . New visits are added automatically up to 8 weeks ahead.
          </p>
        </div>
        <div className="space-y-4 text-sm">
          <div className="rounded-xl border p-3">
            <p className="font-medium">
              {b.address.line1}
              {b.address.line2 ? `, ${b.address.line2}` : ""}
            </p>
            <p className="text-muted-foreground">
              {b.address.city} {b.address.postalCode}
            </p>
            <p className="mt-1 text-muted-foreground">
              {b.bedrooms} bd · {b.bathrooms.toString()} ba
              {extras.length
                ? ` · ${extras.map((e) => e.slug.replaceAll("-", " ")).join(", ")}`
                : ""}
            </p>
            <p className="mt-1 text-muted-foreground">
              {b.paymentMethod
                ? `${b.paymentMethod.brand} •••• ${b.paymentMethod.last4}`
                : "No card on file"}{" "}
              ·{" "}
              <Link href="/account/payment" className="underline">
                payment
              </Link>
            </p>
          </div>
          {b.status !== "CANCELLED" && b.status !== "COMPLETED" && b.frequency !== "ONE_TIME" ? (
            <div className="rounded-xl border p-3">
              <SeriesControls bookingId={b.id} status={b.status} />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
