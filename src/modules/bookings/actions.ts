"use server";

import { z } from "zod";
import { prisma } from "@/modules/db/client";
import { sendEmail } from "@/modules/notifications/email";
import { bookingConfirmationEmail } from "@/modules/notifications/templates/booking-confirmation";
import { ensureCustomer } from "@/modules/payments/customers";
import { createSetupIntent } from "@/modules/payments/setup-intents";
import { isStripeConfigured } from "@/modules/payments/stripe";
import { createQuote } from "@/modules/pricing/quote-service";
import { quoteRequestSchema, type QuoteRequest } from "@/modules/pricing/schemas";
import { findRegionByFsa, normalizePostal } from "@/modules/regions/lookup";
import { loadAvailability, type DayAvailability } from "@/modules/scheduling/availability";
import { addLocalDays, dateColumnToLocalDate, formatInZone, todayIn } from "@/modules/shared/dates";
import { createBooking } from "./create-booking";
import { confirmBookingSchema, contactSchema, type ConfirmBookingInput } from "./schemas";

export type RegionLookupResult =
  | {
      ok: true;
      region: {
        id: string;
        slug: string;
        name: string;
        province: string;
        timezone: string;
        phone: string | null;
      };
      fsa: string;
      postalCode: string | null;
    }
  | { ok: false; code: "INVALID_POSTAL" | "OUT_OF_AREA"; fsa?: string; postalCode?: string | null };

export async function lookupPostalAction(postalInput: string): Promise<RegionLookupResult> {
  const postal = normalizePostal(postalInput);
  if (!postal) return { ok: false, code: "INVALID_POSTAL" };
  const region = await findRegionByFsa(postal.fsa);
  if (!region)
    return { ok: false, code: "OUT_OF_AREA", fsa: postal.fsa, postalCode: postal.postalCode };
  return {
    ok: true,
    region: {
      id: region.id,
      slug: region.slug,
      name: region.name,
      province: region.province,
      timezone: region.timezone,
      phone: region.phone,
    },
    fsa: postal.fsa,
    postalCode: postal.postalCode,
  };
}

export async function quoteAction(raw: QuoteRequest) {
  const parsed = quoteRequestSchema.safeParse(raw);
  if (!parsed.success)
    return {
      ok: false as const,
      error: { code: "INVALID" as const, message: "Invalid quote request." },
    };
  return createQuote(parsed.data);
}

export async function availabilityAction(
  regionId: string,
  days = 21,
): Promise<{ from: string; days: DayAvailability[] }> {
  const region = await prisma.region.findUniqueOrThrow({
    where: { id: regionId },
    select: { timezone: true },
  });
  const from = todayIn(region.timezone);
  const to = addLocalDays(from, Math.min(Math.max(days, 1), 60));
  return { from, days: await loadAvailability(regionId, from, to) };
}

export async function prepareCheckoutAction(
  regionId: string,
  contactRaw: unknown,
): Promise<
  | { ok: true; customerId: string; clientSecret: string | null; stripeConfigured: boolean }
  | { ok: false; message: string }
> {
  const contact = contactSchema.safeParse(contactRaw);
  if (!contact.success) return { ok: false, message: "Please check your contact details." };
  const region = await prisma.region.findUniqueOrThrow({
    where: { id: regionId },
    select: { organizationId: true },
  });
  const customer = await ensureCustomer(region.organizationId, { ...contact.data, source: "web" });
  if (!isStripeConfigured())
    return { ok: true, customerId: customer.id, clientSecret: null, stripeConfigured: false };
  const si = await createSetupIntent(customer.stripeCustomerId!, customer.id);
  return {
    ok: true,
    customerId: customer.id,
    clientSecret: si.clientSecret,
    stripeConfigured: true,
  };
}

export async function confirmBookingAction(
  raw: ConfirmBookingInput,
): Promise<{ ok: true; bookingNumber: string } | { ok: false; code: string; message: string }> {
  const parsed = confirmBookingSchema.safeParse(raw);
  if (!parsed.success)
    return {
      ok: false,
      code: "INVALID",
      message: parsed.error.issues[0]?.message ?? "Invalid booking.",
    };
  const result = await createBooking(parsed.data);
  if (!result.ok) return { ok: false, code: result.error.code, message: result.error.message };
  try {
    await sendConfirmation(result.bookingId);
  } catch (e) {
    console.error("confirmation email failed", e);
  }
  return { ok: true, bookingNumber: result.bookingNumber };
}

const areaRequestSchema = z.object({
  email: z.string().email(),
  postalCode: z.string().min(3).max(7),
});

export async function areaRequestAction(raw: unknown): Promise<{ ok: boolean }> {
  const parsed = areaRequestSchema.safeParse(raw);
  if (!parsed.success) return { ok: false };
  const postal = normalizePostal(parsed.data.postalCode);
  if (!postal) return { ok: false };
  const org = await prisma.organization.findFirstOrThrow({ select: { id: true } });
  await prisma.serviceAreaRequest.create({
    data: {
      organizationId: org.id,
      email: parsed.data.email.toLowerCase(),
      postalCode: postal.postalCode ?? postal.fsa,
      fsa: postal.fsa,
    },
  });
  return { ok: true };
}

const FREQ_LABEL: Record<string, string> = {
  ONE_TIME: "One-time",
  WEEKLY: "Weekly",
  BIWEEKLY: "Every 2 weeks",
  EVERY_4_WEEKS: "Every 4 weeks",
};

async function sendConfirmation(bookingId: string) {
  const booking = await prisma.booking.findUniqueOrThrow({
    where: { id: bookingId },
    include: {
      customer: true,
      service: true,
      region: true,
      address: true,
      window: true,
      jobs: { where: { sequenceNumber: 1 }, include: { activeQuote: true } },
    },
  });
  const job = booking.jobs[0];
  const brand = process.env.NEXT_PUBLIC_BRAND_NAME ?? "MSB Sparkle";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const settings = (
    await prisma.organization.findUniqueOrThrow({ where: { id: booking.organizationId } })
  ).settings as { supportPhone?: string };
  const tpl = bookingConfirmationEmail({
    brand,
    firstName: booking.customer.firstName,
    bookingNumber: booking.bookingNumber,
    serviceName: booking.service.name,
    dateLabel: formatInZone(job.scheduledStartAt, booking.region.timezone, "EEEE, MMMM d"),
    windowLabel: booking.window.label,
    addressLine: `${booking.address.line1}${booking.address.line2 ? `, ${booking.address.line2}` : ""}, ${booking.address.city} ${booking.address.postalCode}`,
    frequencyLabel: FREQ_LABEL[booking.frequency] ?? booking.frequency,
    totalCents: job.activeQuote?.totalCents ?? 0,
    manageUrl: `${appUrl}/account`,
    supportPhone: settings.supportPhone,
  });
  await sendEmail({
    ...tpl,
    to: booking.customer.email,
    templateKey: "booking.confirmed",
    organizationId: booking.organizationId,
    recipientType: "CUSTOMER",
    recipientId: booking.customer.id,
    bookingId: booking.id,
    jobId: job.id,
    dedupeKey: `booking.confirmed:${booking.id}`,
    payload: {
      bookingNumber: booking.bookingNumber,
      date: dateColumnToLocalDate(job.scheduledDate),
    },
  });
}
