import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/modules/db/client";
import { recomputeQuote } from "@/modules/pricing/quote-service";
import type { QuoteInput } from "@/modules/pricing/types";
import { dateColumnToLocalDate } from "@/modules/shared/dates";

/**
 * Price lock at the late-cancel cutoff: re-quotes unlocked jobs against current rates and tax
 * (so far-out recurring visits pick up published pricing changes), then freezes the price and
 * snapshots the address. After this, only an admin adjustment can change the total.
 */
export async function runCutoff(now = new Date()): Promise<{ locked: number; repriced: number }> {
  const jobs = await prisma.job.findMany({
    where: {
      priceLockedAt: null,
      status: { in: ["PENDING", "CONFIRMED", "ASSIGNED", "EN_ROUTE"] },
      scheduledStartAt: { lte: new Date(now.getTime() + 7 * 86_400_000) },
    },
    include: { region: true, activeQuote: true, address: true },
  });
  let locked = 0;
  let repriced = 0;
  for (const job of jobs) {
    const cutoff = new Date(
      job.scheduledStartAt.getTime() - job.region.lateCancelWindowHours * 3600_000,
    );
    if (cutoff > now) continue;
    const date = dateColumnToLocalDate(job.scheduledDate);
    let quoteId = job.activeQuoteId;
    if (job.activeQuote) {
      const input = job.activeQuote.inputs as unknown as QuoteInput;
      const { rates, quote } = await recomputeQuote(job.organizationId, input, date);
      if (quote.totalCents !== job.activeQuote.totalCents) {
        const q = await prisma.priceQuote.create({
          data: {
            bookingId: job.bookingId,
            regionId: job.regionId,
            pricingTableId: rates.pricingTableId,
            engineVersion: quote.engineVersion,
            inputs: { ...input, serviceDate: date } as unknown as Prisma.InputJsonValue,
            lines: quote.lines as unknown as Prisma.InputJsonValue,
            subtotalCents: quote.subtotalCents,
            discountCents: quote.discountCents,
            taxableCents: quote.taxableCents,
            taxCents: quote.taxCents,
            totalCents: quote.totalCents,
            estimatedMinutes: quote.estimatedMinutes,
            reason:
              rates.pricingTableId !== job.activeQuote.pricingTableId
                ? "REGENERATION"
                : "TAX_CHANGE",
          },
        });
        await prisma.priceQuote.update({
          where: { id: job.activeQuoteId! },
          data: { jobId: null },
        });
        await prisma.priceQuote.update({ where: { id: q.id }, data: { jobId: job.id } });
        quoteId = q.id;
        repriced++;
        await prisma.jobEvent.create({
          data: {
            jobId: job.id,
            type: "REPRICED",
            actorType: "SYSTEM",
            data: { from: job.activeQuote.totalCents, to: quote.totalCents, at: "cutoff" },
          },
        });
      }
    }
    await prisma.job.update({
      where: { id: job.id },
      data: {
        priceLockedAt: now,
        activeQuoteId: quoteId,
        estimatedMinutes: undefined,
        addressSnapshot: {
          line1: job.address.line1,
          line2: job.address.line2,
          city: job.address.city,
          province: job.address.province,
          postalCode: job.address.postalCode,
          entryInstructions: job.address.entryInstructions,
          parkingInstructions: job.address.parkingInstructions,
          pets: job.address.pets,
        },
      },
    });
    locked++;
  }
  return { locked, repriced };
}
