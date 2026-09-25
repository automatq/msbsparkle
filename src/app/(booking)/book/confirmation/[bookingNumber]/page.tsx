import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { prisma } from "@/modules/db/client";
import { formatInZone } from "@/modules/shared/dates";
import { formatCents } from "@/modules/shared/money";

export default async function ConfirmationPage({
  params,
}: PageProps<"/book/confirmation/[bookingNumber]">) {
  const { bookingNumber } = await params;
  const booking = await prisma.booking.findUnique({
    where: { bookingNumber },
    include: {
      service: true,
      region: true,
      window: true,
      customer: true,
      jobs: { orderBy: { sequenceNumber: "asc" }, take: 3, include: { activeQuote: true } },
    },
  });
  if (!booking) notFound();
  const first = booking.jobs[0];
  return (
    <div className="mx-auto max-w-xl space-y-6 text-center">
      <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-emerald-100 text-2xl">
        ✓
      </div>
      <h1 className="text-2xl font-semibold">You&apos;re booked, {booking.customer.firstName}!</h1>
      <p className="text-muted-foreground">
        Booking{" "}
        <span className="font-mono font-medium text-foreground" data-testid="booking-number">
          {booking.bookingNumber}
        </span>
        . A confirmation is on its way to {booking.customer.email}.
      </p>
      <div className="rounded-xl border p-4 text-left text-sm">
        <Row k="Service" v={booking.service.name} />
        <Row
          k="First clean"
          v={`${formatInZone(first.scheduledStartAt, booking.region.timezone, "EEEE, MMMM d")} · ${booking.window.label}`}
        />
        <Row
          k="Frequency"
          v={
            booking.frequency === "ONE_TIME"
              ? "One-time"
              : booking.frequency === "WEEKLY"
                ? "Weekly"
                : booking.frequency === "BIWEEKLY"
                  ? "Every 2 weeks"
                  : "Every 4 weeks"
          }
        />
        <Row
          k="First clean total"
          v={`${formatCents(first.activeQuote?.totalCents ?? 0)} (charged after service)`}
        />
        {booking.jobs.length > 1 ? (
          <Row
            k="Next visits"
            v={
              booking.jobs
                .slice(1)
                .map((j) => formatInZone(j.scheduledStartAt, booking.region.timezone, "MMM d"))
                .join(", ") + "…"
            }
          />
        ) : null}
      </div>
      <p className="text-sm text-muted-foreground">
        Free changes up to 24 hours before your arrival window. Sign in with your email to manage
        bookings.
      </p>
      <Button render={<Link href="/login" />}>Manage my booking</Button>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4 py-1.5">
      <span className="text-muted-foreground">{k}</span>
      <span className="text-right">{v}</span>
    </div>
  );
}
