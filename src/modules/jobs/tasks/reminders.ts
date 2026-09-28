import { prisma } from "@/modules/db/client";
import { appUrl, brand, customerTarget, notify } from "@/modules/notifications/send";
import { reminderTemplate } from "@/modules/notifications/templates";
import { dateColumnToLocalDate, formatInZone } from "@/modules/shared/dates";

const OPEN = ["PENDING", "CONFIRMED", "ASSIGNED"] as const;

/**
 * Sends 3-day and 1-day reminders for jobs whose arrival window starts inside the lookahead
 * bucket. Runs every 15 minutes; dedupe keys include the scheduled date so a rescheduled job
 * gets fresh reminders for its new date and never a duplicate for the same date.
 */
export async function runReminders(
  now = new Date(),
  bucketMinutes = 15,
): Promise<{ sent: number }> {
  let sent = 0;
  for (const days of [3, 1] as const) {
    const from = new Date(now.getTime() + days * 86_400_000 - bucketMinutes * 60_000);
    const to = new Date(now.getTime() + days * 86_400_000 + bucketMinutes * 60_000);
    const jobs = await prisma.job.findMany({
      where: { status: { in: [...OPEN] }, scheduledStartAt: { gte: from, lt: to } },
      include: {
        customer: true,
        service: true,
        booking: { include: { window: true } },
        activeQuote: true,
        assignments: { where: { status: "ACCEPTED" }, include: { cleaner: true } },
      },
    });
    for (const job of jobs) {
      const key = `job.reminder_${days}d:${job.id}:${dateColumnToLocalDate(job.scheduledDate)}`;
      if (await prisma.notification.findFirst({ where: { dedupeKey: { startsWith: key } } }))
        continue;
      const msg = reminderTemplate({
        brand: brand(),
        firstName: job.customer.firstName,
        when: formatInZone(job.scheduledStartAt, job.timezone, "EEEE, MMMM d"),
        windowLabel: job.booking.window.label,
        serviceName: job.service.name,
        cleanerName: job.assignments[0]?.cleaner.firstName ?? null,
        daysOut: days,
        manageUrl: `${appUrl()}/account`,
        totalCents: (job.activeQuote?.totalCents ?? 0) + job.tipCents,
      });
      await notify(
        await customerTarget(job.customerId, { jobId: job.id, bookingId: job.bookingId }),
        `job.reminder_${days}d`,
        msg,
        key,
      );
      sent++;
    }
  }
  return { sent };
}
