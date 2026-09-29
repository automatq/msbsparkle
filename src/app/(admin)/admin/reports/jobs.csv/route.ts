import { getCtx } from "@/modules/auth/session";
import { prisma } from "@/modules/db/client";
import { regionWhere } from "@/modules/db/scoped";
import {
  addLocalDays,
  dateColumnToLocalDate,
  localDateToDateColumn,
  todayIn,
} from "@/modules/shared/dates";

function csv(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

export async function GET() {
  const ctx = await getCtx("SUPER_ADMIN", "REGION_ADMIN");
  const today = todayIn("America/Toronto");
  const jobs = await prisma.job.findMany({
    where: {
      ...regionWhere(ctx),
      scheduledDate: {
        gte: localDateToDateColumn(addLocalDays(today, -90)),
        lte: localDateToDateColumn(addLocalDays(today, 60)),
      },
    },
    include: {
      region: true,
      customer: true,
      service: true,
      booking: true,
      activeQuote: true,
      assignments: { where: { status: "ACCEPTED" }, include: { cleaner: true } },
    },
    orderBy: [{ scheduledDate: "asc" }, { windowStartLocal: "asc" }],
  });
  const header = [
    "date",
    "window",
    "region",
    "booking",
    "sequence",
    "customer",
    "email",
    "service",
    "frequency",
    "status",
    "payment_status",
    "cleaners",
    "estimated_minutes",
    "subtotal",
    "tax",
    "total",
    "tip",
  ];
  const rows = jobs.map((j) => [
    dateColumnToLocalDate(j.scheduledDate),
    j.windowStartLocal,
    j.region.name,
    j.booking.bookingNumber,
    j.sequenceNumber,
    `${j.customer.firstName} ${j.customer.lastName}`,
    j.customer.email,
    j.service.name,
    j.booking.frequency,
    j.status,
    j.paymentStatus,
    j.assignments.map((a) => `${a.cleaner.firstName} ${a.cleaner.lastName}`).join("; "),
    j.estimatedMinutes,
    ((j.activeQuote?.subtotalCents ?? 0) / 100).toFixed(2),
    ((j.activeQuote?.taxCents ?? 0) / 100).toFixed(2),
    ((j.activeQuote?.totalCents ?? 0) / 100).toFixed(2),
    (j.tipCents / 100).toFixed(2),
  ]);
  const body = [header, ...rows].map((r) => r.map(csv).join(",")).join("\n");
  return new Response(body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="jobs-${today}.csv"`,
    },
  });
}
