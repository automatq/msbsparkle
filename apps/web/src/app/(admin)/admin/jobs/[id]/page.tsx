import Link from "next/link";
import { notFound } from "next/navigation";
import {
  AssignPanel,
  CancelPanel,
  NotePanel,
  PaymentPanel,
  ReschedulePanel,
  StatusPanel,
  SuggestPanel,
  UnassignButton,
} from "@/components/admin/job-panels";
import { StatusBadge } from "@/components/admin/ui";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { assertRegionAccess, requireRole } from "@/modules/auth/session";
import { isLateCancel, lateCancelFeeCents } from "@/modules/bookings/cancel";
import { prisma } from "@/modules/db/client";
import { isStripeConfigured } from "@/modules/payments/stripe";
import { suggestCleaners } from "@/modules/scheduling/dispatch";
import type { QuoteLine } from "@/modules/pricing/types";
import { dateColumnToLocalDate, formatInZone } from "@/modules/shared/dates";
import { formatCents } from "@/modules/shared/money";

export const dynamic = "force-dynamic";

export default async function JobPage({ params }: PageProps<"/admin/jobs/[id]">) {
  const ctx = await requireRole("/admin/login", "SUPER_ADMIN", "REGION_ADMIN");
  const { id } = await params;
  const job = await prisma.job.findUnique({
    where: { id },
    include: {
      customer: true,
      service: true,
      region: { include: { windows: { where: { active: true }, orderBy: { sortOrder: "asc" } } } },
      booking: { include: { window: true, address: true } },
      activeQuote: true,
      assignments: { include: { cleaner: true }, orderBy: { createdAt: "asc" } },
      events: { orderBy: { createdAt: "desc" }, take: 50 },
      charges: { include: { refunds: true }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!job) notFound();
  try {
    assertRegionAccess(ctx, job.regionId);
  } catch {
    return <p className="text-destructive">You don&apos;t have access to this region.</p>;
  }
  const cleaners = await prisma.cleaner.findMany({
    where: {
      status: "ACTIVE",
      OR: [{ homeRegionId: job.regionId }, { regions: { some: { regionId: job.regionId } } }],
    },
    orderBy: { firstName: "asc" },
  });
  const suggestions = ["COMPLETED", "CANCELLED", "SKIPPED", "NO_SHOW"].includes(job.status)
    ? []
    : await suggestCleaners(job.id);
  const active = job.assignments.filter((a) => ["ACCEPTED", "OFFERED"].includes(a.status));
  const addr = job.addressSnapshot as {
    line1: string;
    line2?: string | null;
    city: string;
    postalCode: string;
    entryInstructions?: string | null;
    parkingInstructions?: string | null;
  };
  const lines = (job.activeQuote?.lines ?? []) as unknown as QuoteLine[];
  const late = isLateCancel(job, job.region);
  const open = !["COMPLETED", "CANCELLED", "SKIPPED", "NO_SHOW"].includes(job.status);
  const extras = job.extras as { slug: string; qty: number }[];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs text-muted-foreground">
            <Link href="/admin/jobs" className="hover:underline">
              Jobs
            </Link>{" "}
            /{" "}
            <Link href={`/admin/bookings/${job.bookingId}`} className="hover:underline">
              {job.booking.bookingNumber}
            </Link>{" "}
            / visit #{job.sequenceNumber}
          </p>
          <h1 className="text-2xl font-semibold">
            {formatInZone(job.scheduledStartAt, job.timezone, "EEEE, MMMM d")} ·{" "}
            {job.windowStartLocal}–{job.windowEndLocal}
          </h1>
          <div className="mt-1 flex items-center gap-2">
            <StatusBadge status={job.status} />
            <StatusBadge status={job.paymentStatus} />
            {job.detached ? (
              <span className="text-xs text-muted-foreground">edited individually</span>
            ) : null}
          </div>
        </div>
        <div className="text-right text-sm">
          <p className="text-2xl font-semibold">
            {formatCents((job.activeQuote?.totalCents ?? 0) + job.tipCents)}
          </p>
          <p className="text-muted-foreground">
            ~{Math.round((job.estimatedMinutes / 60) * 10) / 10}h · {job.region.name}
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Cleaners</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {active.length === 0 ? <p className="text-sm text-amber-700">Unassigned</p> : null}
              {active.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center justify-between rounded-lg border p-2 text-sm"
                >
                  <span>
                    <Link
                      href={`/admin/cleaners/${a.cleanerId}`}
                      className="font-medium hover:underline"
                    >
                      {a.cleaner.firstName} {a.cleaner.lastName}
                    </Link>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {a.role} · {a.status}
                    </span>
                    {a.checkInAt ? (
                      <span className="ml-2 text-xs">
                        in {formatInZone(a.checkInAt, job.timezone, "h:mm a")}
                      </span>
                    ) : null}
                    {a.checkOutAt ? (
                      <span className="ml-2 text-xs">
                        out {formatInZone(a.checkOutAt, job.timezone, "h:mm a")}
                      </span>
                    ) : null}
                  </span>
                  {open ? <UnassignButton jobId={job.id} cleanerId={a.cleanerId} /> : null}
                </div>
              ))}
              {open ? <SuggestPanel jobId={job.id} suggestions={suggestions} /> : null}
              {open ? (
                <AssignPanel
                  jobId={job.id}
                  cleaners={cleaners.map((c) => ({
                    id: c.id,
                    name: `${c.firstName} ${c.lastName}`,
                  }))}
                  assigned={active.map((a) => a.cleanerId)}
                />
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <StatusPanel jobId={job.id} status={job.status} />
              {open ? (
                <>
                  <div>
                    <p className="mb-1 text-xs font-medium text-muted-foreground">Reschedule</p>
                    <ReschedulePanel
                      jobId={job.id}
                      date={dateColumnToLocalDate(job.scheduledDate)}
                      windowId={
                        job.region.windows.find((w) => w.startLocal === job.windowStartLocal)?.id ??
                        null
                      }
                      windows={job.region.windows.map((w) => ({ id: w.id, label: w.label }))}
                    />
                  </div>
                  <div>
                    <p className="mb-1 text-xs font-medium text-muted-foreground">Cancel</p>
                    <CancelPanel
                      jobId={job.id}
                      late={late}
                      feeCents={lateCancelFeeCents(job.region, job.activeQuote?.totalCents ?? 0)}
                      recurring={job.booking.frequency !== "ONE_TIME"}
                    />
                  </div>
                </>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Payment</CardTitle>
            </CardHeader>
            <CardContent>
              <PaymentPanel
                jobId={job.id}
                status={job.status}
                paymentStatus={job.paymentStatus}
                stripeConfigured={isStripeConfigured()}
                charges={job.charges.map((c) => ({
                  id: c.id,
                  type: c.type,
                  status: c.status,
                  amountCents: c.amountCents,
                  refundedCents: c.refunds
                    .filter((r) => r.status === "SUCCEEDED")
                    .reduce((s, r) => s + r.amountCents, 0),
                }))}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Timeline</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <NotePanel jobId={job.id} />
              <ul className="space-y-1 text-xs">
                {job.events.map((e) => (
                  <li key={e.id} className="flex gap-2">
                    <span className="w-36 shrink-0 text-muted-foreground">
                      {formatInZone(e.createdAt, job.timezone, "MMM d, h:mm a")}
                    </span>
                    <span className="w-28 shrink-0 font-medium">{e.type.replaceAll("_", " ")}</span>
                    <span className="text-muted-foreground">
                      {e.actorType.toLowerCase()} · {summarize(e.data as Record<string, unknown>)}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Customer</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <p>
                <Link
                  href={`/admin/customers/${job.customerId}`}
                  className="font-medium hover:underline"
                >
                  {job.customer.firstName} {job.customer.lastName}
                </Link>
              </p>
              <p className="text-muted-foreground">{job.customer.email}</p>
              <p className="text-muted-foreground">{job.customer.phone}</p>
              <p className="pt-2">
                {addr.line1}
                {addr.line2 ? `, ${addr.line2}` : ""}
                <br />
                {addr.city} {addr.postalCode}
              </p>
              {addr.entryInstructions ? (
                <p className="pt-1">
                  <span className="text-xs text-muted-foreground">Entry:</span>{" "}
                  {addr.entryInstructions}
                </p>
              ) : null}
              {addr.parkingInstructions ? (
                <p>
                  <span className="text-xs text-muted-foreground">Parking:</span>{" "}
                  {addr.parkingInstructions}
                </p>
              ) : null}
              {job.customerNotes ? (
                <p className="pt-1">
                  <span className="text-xs text-muted-foreground">Customer notes:</span>{" "}
                  {job.customerNotes}
                </p>
              ) : null}
              {job.internalNotes ? (
                <p className="pt-1">
                  <span className="text-xs text-muted-foreground">Internal:</span>{" "}
                  {job.internalNotes}
                </p>
              ) : null}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Service</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <p className="font-medium">
                {job.service.name}
                {job.isFirstCleanUpgrade ? " (first-clean upgrade)" : ""}
              </p>
              <p className="text-muted-foreground">
                {job.bedrooms} bd · {job.bathrooms.toString()} ba
                {job.sqft ? ` · ${job.sqft} sq ft` : ""}
              </p>
              {extras.length ? (
                <p className="text-muted-foreground">
                  Extras:{" "}
                  {extras.map((e) => `${e.slug}${e.qty > 1 ? ` ×${e.qty}` : ""}`).join(", ")}
                </p>
              ) : null}
              <ul className="pt-2">
                {lines.map((l, i) => (
                  <li key={i} className="flex justify-between text-xs">
                    <span className="text-muted-foreground">{l.label}</span>
                    <span>{formatCents(l.amountCents)}</span>
                  </li>
                ))}
                <li className="flex justify-between border-t pt-1 font-medium">
                  <span>Total</span>
                  <span>{formatCents(job.activeQuote?.totalCents ?? 0)}</span>
                </li>
                {job.tipCents ? (
                  <li className="flex justify-between text-xs">
                    <span>Tip</span>
                    <span>{formatCents(job.tipCents)}</span>
                  </li>
                ) : null}
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function summarize(d: Record<string, unknown>): string {
  if (typeof d.note === "string") return d.note;
  if (d.from && d.to) return `${d.from} → ${d.to}${d.reason ? ` (${d.reason})` : ""}`;
  if (d.cleanerId)
    return `cleaner ${String(d.cleanerId).slice(-6)}${d.status ? ` ${d.status}` : ""}${d.reason ? ` (${d.reason})` : ""}`;
  if (d.after && typeof d.after === "object")
    return `to ${(d.after as { scheduledDate?: string }).scheduledDate ?? ""} ${(d.after as { windowStartLocal?: string }).windowStartLocal ?? ""}`;
  if (d.status) return String(d.status);
  return Object.keys(d).length ? JSON.stringify(d).slice(0, 80) : "";
}
