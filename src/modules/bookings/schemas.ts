import { z } from "zod";
import { quoteRequestSchema } from "@/modules/pricing/schemas";

export const contactSchema = z.object({
  firstName: z.string().trim().min(1).max(60),
  lastName: z.string().trim().min(1).max(60),
  email: z.string().trim().email(),
  phone: z.string().trim().min(7).max(20),
});

export const addressSchema = z.object({
  line1: z.string().trim().min(3).max(120),
  line2: z.string().trim().max(60).optional().or(z.literal("")),
  city: z.string().trim().min(1).max(60),
  postalCode: z.string().trim().min(6).max(7),
  entryInstructions: z.string().trim().max(500).optional().or(z.literal("")),
  parkingInstructions: z.string().trim().max(300).optional().or(z.literal("")),
});

export const confirmBookingSchema = z.object({
  quoteId: z.string().min(1),
  quoteRequest: quoteRequestSchema,
  scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  windowId: z.string().min(1),
  contact: contactSchema,
  address: addressSchema,
  customerNotes: z.string().trim().max(1000).optional().or(z.literal("")),
  setupIntentId: z.string().nullable().optional(),
  customerId: z.string().min(1),
  marketingConsent: z.boolean().default(false),
});

export type ConfirmBookingInput = z.infer<typeof confirmBookingSchema>;
