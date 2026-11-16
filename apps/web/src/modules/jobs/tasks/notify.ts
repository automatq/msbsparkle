import { prisma } from "@/modules/db/client";
import { appUrl, brand, cleanerTarget, customerTarget, notify } from "@/modules/notifications/send";
import {
  cleanerAssignedTemplate,
  cleanerJobChangedTemplate,
  customerTrackingTemplate,
  type TrackingKind,
  reviewRequestTemplate,
  type CleanerJobChange,
} from "@/modules/notifications/templates";
import { formatInZone } from "@/modules/shared/dates";

export async function notifyCleanerAssigned(
  jobId: string,
  cleanerId: string,
  offered: boolean,
): Promise<void> {
  const [job, cleaner] = await Promise.all([
    prisma.job.findUniqueOrThrow({
      where: { id: jobId },
      include: { service: true, region: true, booking: { include: { window: true } } },
    }),
    prisma.cleaner.findUniqueOrThrow({ where: { id: cleanerId } }),
  ]);
  const addr = job.addressSnapshot as { city?: string };
  const msg = cleanerAssignedTemplate({
    brand: brand(),
    jobId: job.id,
    firstName: cleaner.firstName,
    offered,
    when: formatInZone(job.scheduledStartAt, job.timezone, "EEE MMM d"),
    windowLabel: job.booking.window.label,
    serviceName: job.service.name,
    area: addr.city ?? job.region.name,
    jobUrl: `${appUrl()}/cleaner/jobs/${job.id}`,
  });
  await notify(
    await cleanerTarget(cleanerId, { jobId }),
    offered ? "cleaner.offered" : "cleaner.assigned",
    msg,
    `cleaner.assigned:${jobId}:${cleanerId}:${offered ? "offer" : "assign"}`,
    ["push", "email", "sms"],
    { smsOnlyWithoutPush: true },
  );
}

/**
 * Tells a cleaner their job was cancelled, rescheduled or taken off their schedule. Push and
 * email; SMS only without the app. Past jobs are ignored. `nonce` separates repeated changes of
 * the same kind (e.g. two reschedules) so each one is sent once.
 */
export async function notifyCleanerJobChanged(
  jobId: string,
  cleanerId: string,
  change: CleanerJobChange,
  opts: { nonce: string; previousStartAt?: string | null },
): Promise<{ sent: boolean }> {
  const [job, cleaner] = await Promise.all([
    prisma.job.findUniqueOrThrow({
      where: { id: jobId },
      include: { service: true, region: true, booking: { include: { window: true } } },
    }),
    prisma.cleaner.findUniqueOrThrow({ where: { id: cleanerId } }),
  ]);
  if (job.scheduledEndAt.getTime() < Date.now()) return { sent: false };
  const addr = job.addressSnapshot as { city?: string };
  const fmt = (d: Date) => formatInZone(d, job.timezone, "EEE MMM d");
  const msg = cleanerJobChangedTemplate({
    brand: brand(),
    jobId: job.id,
    firstName: cleaner.firstName,
    change,
    when: fmt(job.scheduledStartAt),
    windowLabel: `${job.windowStartLocal}–${job.windowEndLocal}`,
    serviceName: job.service.name,
    area: addr.city ?? job.region.name,
    previousWhen: opts.previousStartAt ? fmt(new Date(opts.previousStartAt)) : undefined,
    jobUrl: `${appUrl()}/cleaner/jobs/${job.id}`,
    scheduleUrl: `${appUrl()}/cleaner`,
  });
  await notify(
    await cleanerTarget(cleanerId, { jobId }),
    `cleaner.${change}`,
    msg,
    `cleaner.${change}:${jobId}:${cleanerId}:${opts.nonce}`,
    ["push", "email", "sms"],
    { smsOnlyWithoutPush: true },
  );
  return { sent: true };
}

export async function sendReviewRequest(jobId: string): Promise<{ sent: boolean }> {
  const job = await prisma.job.findUniqueOrThrow({
    where: { id: jobId },
    include: {
      customer: true,
      review: true,
      assignments: { where: { status: "ACCEPTED" }, include: { cleaner: true } },
    },
  });
  if (job.status !== "COMPLETED" || job.review) return { sent: false };
  const msg = reviewRequestTemplate({
    brand: brand(),
    firstName: job.customer.firstName,
    cleanerName: job.assignments[0]?.cleaner.firstName ?? null,
    accountUrl: `${appUrl()}/account`,
  });
  await notify(
    await customerTarget(job.customerId, { jobId }),
    "review.request",
    msg,
    `review.request:${jobId}`,
  );
  return { sent: true };
}

export async function sendBookingConfirmationSms(bookingId: string): Promise<void> {
  const b = await prisma.booking.findUniqueOrThrow({
    where: { id: bookingId },
    include: {
      customer: true,
      service: true,
      region: true,
      window: true,
      jobs: { where: { sequenceNumber: 1 } },
    },
  });
  const job = b.jobs[0];
  if (!job) return;
  const sms = `${brand()}: you're booked! ${b.service.name} on ${formatInZone(job.scheduledStartAt, b.region.timezone, "EEE MMM d")}, arrival ${b.window.label}. Booking ${b.bookingNumber}. Manage: ${appUrl()}/account. Reply STOP to opt out.`;
  await notify(
    await customerTarget(b.customerId, { jobId: job.id, bookingId }),
    "booking.confirmed",
    { subject: "", html: "", text: "", sms },
    `booking.confirmed.sms:${bookingId}`,
    ["sms"],
  );
}

/**
 * Tells the customer their cleaner is on the way / arriving / running late, with the tracking
 * link. "On the way" goes by SMS and email; the follow-ups by SMS only (email if they opted out).
 */
export async function notifyCustomerTracking(
  assignmentId: string,
  kind: TrackingKind,
): Promise<{ sent: boolean }> {
  const a = await prisma.assignment.findUniqueOrThrow({
    where: { id: assignmentId },
    include: { cleaner: true, job: { include: { customer: true } } },
  });
  if (!a.trackingToken || a.status !== "ACCEPTED" || a.job.status !== "EN_ROUTE")
    return { sent: false };
  const msg = customerTrackingTemplate({
    brand: brand(),
    kind,
    customerFirstName: a.job.customer.firstName,
    cleanerFirstName: a.cleaner.firstName,
    eta: a.etaAt ? formatInZone(a.etaAt, a.job.timezone, "h:mm a") : null,
    trackUrl: `${appUrl()}/track/${a.trackingToken}`,
  });
  const target = await customerTarget(a.job.customerId, { jobId: a.jobId });
  const channels: ("email" | "sms")[] =
    kind === "en_route" || target.smsOptOut || !target.phone ? ["email", "sms"] : ["sms"];
  await notify(
    target,
    `customer.tracking.${kind}`,
    msg,
    `tracking.${kind}:${a.id}:${a.trackingToken}`,
    channels,
  );
  return { sent: true };
}
