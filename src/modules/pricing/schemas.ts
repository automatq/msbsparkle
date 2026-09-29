import { z } from "zod";

export const frequencySchema = z.enum(["ONE_TIME", "WEEKLY", "BIWEEKLY", "EVERY_4_WEEKS"]);

export const quoteRequestSchema = z.object({
  postalCode: z.string().min(3).max(7),
  serviceSlug: z.string().min(1),
  bedrooms: z.number().int().min(0).max(12),
  bathrooms: z.number().min(1).max(12),
  sqft: z.number().int().min(100).max(20000).nullable().optional(),
  extras: z.array(z.object({ slug: z.string(), qty: z.number().int().min(0).max(10) })).default([]),
  hourly: z
    .object({ hours: z.number().min(1).max(12), cleaners: z.number().int().min(1).max(4) })
    .nullable()
    .optional(),
  frequency: frequencySchema,
  firstCleanUpgradeSlug: z.string().nullable().optional(),
  promoCode: z.string().trim().max(32).nullable().optional(),
  serviceDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

export type QuoteRequest = z.infer<typeof quoteRequestSchema>;
