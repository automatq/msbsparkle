import { unlink } from "node:fs/promises";
import path from "node:path";
import type { ActorType } from "@/generated/prisma/enums";
import { prisma } from "@/modules/db/client";
import { pruneRateLimits } from "@/modules/shared/rate-limit";

export const PHOTO_RETENTION_DAYS = 90;

/** Deletes job photos older than the retention window (files + rows) and prunes rate-limit windows. */
export async function runRetention(
  now = new Date(),
): Promise<{ photosDeleted: number; rateLimitRowsPruned: number }> {
  const cutoff = new Date(now.getTime() - PHOTO_RETENTION_DAYS * 86_400_000);
  const photos = await prisma.jobPhoto.findMany({
    where: { takenAt: { lt: cutoff } },
    select: { id: true, storageKey: true },
  });
  for (const p of photos) {
    await unlink(path.join(process.cwd(), "uploads", p.storageKey)).catch(() => {});
    await prisma.jobPhoto.delete({ where: { id: p.id } });
  }
  const rateLimitRowsPruned = await pruneRateLimits(now);
  return { photosDeleted: photos.length, rateLimitRowsPruned };
}

/**
 * PIPEDA erasure: strips personal data from a customer while keeping financial records.
 * Bookings/jobs/charges stay for accounting, but names, contact details and notes are removed.
 */
export async function anonymizeCustomer(
  customerId: string,
  actor: { type: ActorType; id?: string | null },
): Promise<void> {
  const c = await prisma.customer.findUniqueOrThrow({
    where: { id: customerId },
    include: { user: true },
  });
  const stub = `deleted-${c.id.slice(-8)}`;
  await prisma.$transaction(async (tx) => {
    await tx.customer.update({
      where: { id: c.id },
      data: {
        firstName: "Deleted",
        lastName: "Customer",
        email: `${stub}@anonymized.invalid`,
        phone: null,
        notes: null,
        tags: [],
        marketingOptIn: false,
        smsOptOut: true,
        anonymizedAt: new Date(),
        userId: null,
        stripeCustomerId: null,
        defaultPaymentMethodId: null,
      },
    });
    await tx.address.updateMany({
      where: { customerId: c.id },
      data: {
        line1: "Redacted",
        line2: null,
        entryInstructions: null,
        parkingInstructions: null,
        secureNotes: null,
        pets: null,
        lat: null,
        lng: null,
        placeId: null,
        archivedAt: new Date(),
      },
    });
    await tx.job.updateMany({
      where: { customerId: c.id },
      data: { customerNotes: null, addressSnapshot: { redacted: true } },
    });
    await tx.booking.updateMany({ where: { customerId: c.id }, data: { customerNotes: null } });
    await tx.paymentMethod.updateMany({
      where: { customerId: c.id },
      data: { status: "DETACHED" },
    });
    await tx.review.updateMany({ where: { customerId: c.id }, data: { isPublic: false } });
    if (c.user)
      await tx.user.update({
        where: { id: c.user.id },
        data: {
          status: "DISABLED",
          email: `${stub}@anonymized.invalid`,
          name: null,
          phone: null,
          sessionVersion: { increment: 1 },
        },
      });
    await tx.auditLog.create({
      data: {
        organizationId: c.organizationId,
        actorType: actor.type,
        actorId: actor.id ?? null,
        entityType: "Customer",
        entityId: c.id,
        action: "customer.anonymize",
      },
    });
  });
}
