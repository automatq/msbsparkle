import { prisma } from "@/modules/db/client";

export async function cleanerForUser(userId: string) {
  return prisma.cleaner.findFirst({ where: { userId }, include: { homeRegion: true } });
}

export async function cleanerJobs(cleanerId: string, from: Date, to: Date) {
  return prisma.assignment.findMany({
    where: {
      cleanerId,
      status: { in: ["OFFERED", "ACCEPTED"] },
      job: { scheduledDate: { gte: from, lte: to }, status: { notIn: ["CANCELLED", "SKIPPED"] } },
    },
    include: {
      job: {
        include: {
          customer: true,
          service: true,
          booking: true,
          region: true,
          assignments: { where: { status: "ACCEPTED" }, include: { cleaner: true } },
        },
      },
    },
    orderBy: [{ job: { scheduledDate: "asc" } }, { job: { windowStartLocal: "asc" } }],
  });
}
