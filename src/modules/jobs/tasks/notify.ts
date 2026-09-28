import { prisma } from "@/modules/db/client";
import { appUrl, brand, cleanerTarget, customerTarget, notify } from "@/modules/notifications/send";
import { cleanerAssignedTemplate, reviewRequestTemplate } from "@/modules/notifications/templates";
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
  );
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
