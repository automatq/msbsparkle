import Link from "next/link";
import { notFound } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import { prisma } from "@/modules/db/client";
import { serviceHue } from "@/modules/marketing/hues";
import { formatInZone } from "@/modules/shared/dates";
import { formatCents } from "@/modules/shared/money";

/**
 * Booking confirmation, shared by /book/confirmation and the embeddable widget. Embedded, links
 * open in a new tab so the visitor stays on the company's website.
 */
export async function BookingConfirmation({
  bookingNumber,
  embedded = false,
}: {
  bookingNumber: string;
  embedded?: boolean;
}) {
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
  const hue = serviceHue(booking.service.slug);
  return (
    <div className="mx-auto max-w-3xl">
      {/* Opens in the service's colour, the way the printed confirmation would. */}
      <section data-hue={hue} className="rounded-3xl bg-hue p-8 text-hue-ink sm:p-10">
        <p className="text-sm font-medium opacity-80">
          Booking{" "}
          <span className="narrow font-semibold opacity-100" data-testid="booking-number">
            {booking.bookingNumber}
          </span>
        </p>
        <h1 className="mt-10 text-4xl font-semibold sm:text-6xl">
          You&apos;re booked, {booking.customer.firstName}!
        </h1>
        <p className="mt-4 max-w-md opacity-90">
          A confirmation is on its way to {booking.customer.email}.
        </p>
      </section>
      <dl className="mt-10 border-t border-foreground">
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
      </dl>
      <p className="mt-6 text-muted-foreground">
        Free changes up to 24 hours before your arrival window. Sign in with your email to manage
        bookings.
      </p>
      {embedded ? (
        <a
          href="/login"
          target="_blank"
          rel="noopener"
          className={buttonVariants({ size: "lg", className: "mt-8 h-12 px-6" })}
        >
          Manage my booking
        </a>
      ) : (
        <Link href="/login" className={buttonVariants({ size: "lg", className: "mt-8 h-12 px-6" })}>
          Manage my booking
        </Link>
      )}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-6 border-b py-3.5">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="text-right font-medium">{v}</dd>
    </div>
  );
}
