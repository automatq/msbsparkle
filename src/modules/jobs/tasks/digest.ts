import { prisma } from "@/modules/db/client";
import { sendEmail } from "@/modules/notifications/email";
import { appUrl, brand } from "@/modules/notifications/send";
import { adminDigestTemplate } from "@/modules/notifications/templates";
import { addLocalDays, localDateToDateColumn, todayIn } from "@/modules/shared/dates";

/** Emails every super admin a per-region summary for today. */
export async function runAdminDigest(now = new Date()): Promise<{ recipients: number }> {
  const org = await prisma.organization.findFirstOrThrow();
  const regions = await prisma.region.findMany({
    where: { organizationId: org.id, status: "ACTIVE" },
    orderBy: { name: "asc" },
  });
  const rows = [];
  for (const r of regions) {
    const today = todayIn(r.timezone, now);
    const yesterday = addLocalDays(today, -1);
    const [jobs, unassigned, completedYesterday, failedPayments] = await Promise.all([
      prisma.job.count({
        where: {
          regionId: r.id,
          scheduledDate: localDateToDateColumn(today),
          status: { notIn: ["CANCELLED", "SKIPPED"] },
        },
      }),
      prisma.job.count({
        where: {
          regionId: r.id,
          scheduledDate: localDateToDateColumn(today),
          status: { in: ["PENDING", "CONFIRMED"] },
        },
      }),
      prisma.job.count({
        where: {
          regionId: r.id,
          scheduledDate: localDateToDateColumn(yesterday),
          status: "COMPLETED",
        },
      }),
      prisma.job.count({ where: { regionId: r.id, paymentStatus: "FAILED" } }),
    ]);
    rows.push({ region: r.name, jobs, unassigned, completedYesterday, failedPayments });
  }
  const admins = await prisma.user.findMany({
    where: { organizationId: org.id, status: "ACTIVE", roles: { some: { role: "SUPER_ADMIN" } } },
  });
  const date = todayIn("America/Toronto", now);
  const msg = adminDigestTemplate({
    brand: brand(),
    date,
    rows,
    adminUrl: `${appUrl()}/admin/calendar`,
  });
  for (const a of admins) {
    await sendEmail({
      to: a.email,
      subject: msg.subject,
      html: msg.html,
      text: msg.text,
      templateKey: "admin.digest",
      organizationId: org.id,
      recipientType: "ADMIN",
      recipientId: a.id,
      dedupeKey: `admin.digest:${a.id}:${date}`,
    }).catch((e) => console.error("digest failed", e));
  }
  return { recipients: admins.length };
}
