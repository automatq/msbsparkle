import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/modules/db/client";
import { verifyAndAttachSetupIntent } from "@/modules/payments/setup-intents";
import { isStripeConfigured } from "@/modules/payments/stripe";
import { recomputeQuote } from "@/modules/pricing/quote-service";
import type { QuoteInput } from "@/modules/pricing/types";
import { normalizePostal } from "@/modules/regions/lookup";
import { loadAvailability } from "@/modules/scheduling/availability";
import { materializeJobs } from "@/modules/scheduling/materialize";
import { localDateToDateColumn, weekdayOf } from "@/modules/shared/dates";
import { generateBookingNumber } from "./booking-number";
import type { ConfirmBookingInput } from "./schemas";

export type CreateBookingError = {
  code:
    | "QUOTE_NOT_FOUND"
    | "QUOTE_STALE"
    | "SLOT_FULL"
    | "SLOT_CLOSED"
    | "PAYMENT_REQUIRED"
    | "PAYMENT_FAILED"
    | "INVALID_ADDRESS"
    | "REGION_MISMATCH";
  message: string;
};

export type CreateBookingResult =
  | { ok: true; bookingId: string; bookingNumber: string; firstJobId: string }
  | { ok: false; error: CreateBookingError };

export async function createBooking(input: ConfirmBookingInput): Promise<CreateBookingResult> {
  const quoteRow = await prisma.priceQuote.findUnique({
    where: { id: input.quoteId },
    include: { region: true },
  });
  if (!quoteRow || quoteRow.jobId)
    return {
      ok: false,
      error: { code: "QUOTE_NOT_FOUND", message: "Your quote expired. Please refresh." },
    };
  const region = quoteRow.region;
  const quoteInput = quoteRow.inputs as unknown as QuoteInput;

  const postal = normalizePostal(input.address.postalCode);
  if (!postal?.postalCode)
    return { ok: false, error: { code: "INVALID_ADDRESS", message: "Enter a full postal code." } };
  const area = await prisma.serviceArea.findUnique({ where: { fsa: postal.fsa } });
  if (!area || area.regionId !== region.id)
    return {
      ok: false,
      error: {
        code: "REGION_MISMATCH",
        message: "The address postal code is outside the quoted region.",
      },
    };

  const service = await prisma.service.findUniqueOrThrow({
    where: {
      organizationId_slug: { organizationId: region.organizationId, slug: quoteInput.serviceSlug },
    },
  });
  const upgrade = quoteInput.firstCleanUpgradeSlug
    ? await prisma.service.findUnique({
        where: {
          organizationId_slug: {
            organizationId: region.organizationId,
            slug: quoteInput.firstCleanUpgradeSlug,
          },
        },
      })
    : null;

  // Re-price against current rates for the actual service date; reject if the customer saw a different total.
  const { quote: fresh, rates } = await recomputeQuote(
    region.organizationId,
    quoteInput,
    input.scheduledDate,
  );
  if (fresh.totalCents !== quoteRow.totalCents)
    return {
      ok: false,
      error: { code: "QUOTE_STALE", message: "Prices were updated. Please review the new total." },
    };

  const customer = await prisma.customer.findUniqueOrThrow({ where: { id: input.customerId } });
  if (
    customer.organizationId !== region.organizationId ||
    customer.email !== input.contact.email.toLowerCase()
  ) {
    return {
      ok: false,
      error: { code: "PAYMENT_REQUIRED", message: "Customer mismatch. Please restart checkout." },
    };
  }

  let paymentMethodId: string | null = null;
  if (isStripeConfigured()) {
    if (!input.setupIntentId)
      return {
        ok: false,
        error: { code: "PAYMENT_REQUIRED", message: "Please add a card to continue." },
      };
    try {
      const pm = await verifyAndAttachSetupIntent(input.setupIntentId, customer.id);
      paymentMethodId = pm.id;
    } catch (e) {
      return {
        ok: false,
        error: {
          code: "PAYMENT_FAILED",
          message: e instanceof Error ? e.message : "Card setup failed.",
        },
      };
    }
  }

  const window = await prisma.arrivalWindow.findUniqueOrThrow({ where: { id: input.windowId } });
  if (window.regionId !== region.id)
    return { ok: false, error: { code: "SLOT_CLOSED", message: "Invalid arrival window." } };

  const promoId = quoteInput.promo
    ? ((
        await prisma.promoCode.findUnique({
          where: {
            organizationId_code: {
              organizationId: region.organizationId,
              code: quoteInput.promo.code,
            },
          },
        })
      )?.id ?? null)
    : null;

  try {
    const result = await prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${region.id}|${input.scheduledDate}|${window.id}`}))`;
        const [day] = await loadAvailability(region.id, input.scheduledDate, input.scheduledDate);
        const slot = day?.windows.find((w) => w.windowId === window.id);
        if (!slot?.open) throw new SlotError(slot?.reason === "FULL" ? "SLOT_FULL" : "SLOT_CLOSED");

        const address = await tx.address.create({
          data: {
            customerId: customer.id,
            regionId: region.id,
            line1: input.address.line1,
            line2: input.address.line2 || null,
            city: input.address.city,
            province: region.province,
            postalCode: postal.postalCode!,
            fsa: postal.fsa,
            entryInstructions: input.address.entryInstructions || null,
            parkingInstructions: input.address.parkingInstructions || null,
            isDefault: true,
          },
        });

        let bookingNumber = generateBookingNumber();
        for (let i = 0; i < 5 && (await tx.booking.findUnique({ where: { bookingNumber } })); i++)
          bookingNumber = generateBookingNumber();

        const booking = await tx.booking.create({
          data: {
            organizationId: region.organizationId,
            regionId: region.id,
            customerId: customer.id,
            addressId: address.id,
            serviceId: service.id,
            paymentMethodId,
            bookingNumber,
            source: "WEB",
            status: "ACTIVE",
            frequency: quoteInput.frequency,
            anchorDate: localDateToDateColumn(input.scheduledDate),
            weekday: weekdayOf(input.scheduledDate),
            windowId: window.id,
            bedrooms: quoteInput.bedrooms,
            bathrooms: quoteInput.bathrooms.toString(),
            sqft: quoteInput.sqft ?? null,
            hourlyHours: quoteInput.hourly?.hours?.toString() ?? null,
            hourlyCleaners: quoteInput.hourly?.cleaners ?? null,
            extras: quoteInput.extras as unknown as Prisma.InputJsonValue,
            firstCleanUpgradeServiceId: upgrade?.id ?? null,
            customerNotes: input.customerNotes || null,
            promoCodeId: promoId,
            marketingConsentAt: input.marketingConsent ? new Date() : null,
          },
        });

        // Attach the checkout quote (re-priced for the actual date) as the first job's quote.
        const firstQuote = await tx.priceQuote.create({
          data: {
            bookingId: booking.id,
            regionId: region.id,
            pricingTableId: rates.pricingTableId,
            engineVersion: fresh.engineVersion,
            inputs: {
              ...quoteInput,
              serviceDate: input.scheduledDate,
            } as unknown as Prisma.InputJsonValue,
            lines: fresh.lines as unknown as Prisma.InputJsonValue,
            subtotalCents: fresh.subtotalCents,
            discountCents: fresh.discountCents,
            taxableCents: fresh.taxableCents,
            taxCents: fresh.taxCents,
            totalCents: fresh.totalCents,
            estimatedMinutes: fresh.estimatedMinutes,
            reason: "BOOKING",
          },
        });

        const jobIds = await materializeJobs(tx, booking, {
          timezone: region.timezone,
          windowStartLocal: window.startLocal,
          windowEndLocal: window.endLocal,
          addressSnapshot: {
            line1: address.line1,
            line2: address.line2,
            city: address.city,
            province: address.province,
            postalCode: address.postalCode,
            entryInstructions: address.entryInstructions,
            parkingInstructions: address.parkingInstructions,
          },
          quoteInput: { ...quoteInput, serviceDate: input.scheduledDate },
          firstQuoteId: firstQuote.id,
          firstUpgradeSlug: quoteInput.firstCleanUpgradeSlug ?? null,
        });

        if (promoId) {
          await tx.promoRedemption.create({
            data: {
              promoCodeId: promoId,
              customerId: customer.id,
              bookingId: booking.id,
              jobId: jobIds[0],
              discountCents: -(fresh.lines.find((l) => l.step === "PROMO")?.amountCents ?? 0),
            },
          });
        }
        await tx.auditLog.create({
          data: {
            organizationId: region.organizationId,
            regionId: region.id,
            actorType: "CUSTOMER",
            actorId: customer.id,
            entityType: "Booking",
            entityId: booking.id,
            action: "booking.create",
            after: { bookingNumber, frequency: booking.frequency, jobs: jobIds.length },
          },
        });

        return { bookingId: booking.id, bookingNumber, firstJobId: jobIds[0] };
      },
      { timeout: 20_000 },
    );
    return { ok: true, ...result };
  } catch (e) {
    if (e instanceof SlotError) {
      return {
        ok: false,
        error: {
          code: e.code,
          message:
            e.code === "SLOT_FULL"
              ? "That arrival window just filled up. Please pick another."
              : "That arrival window is no longer available.",
        },
      };
    }
    throw e;
  }
}

class SlotError extends Error {
  constructor(public code: "SLOT_FULL" | "SLOT_CLOSED") {
    super(code);
  }
}
