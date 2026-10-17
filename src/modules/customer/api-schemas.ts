import { z } from "zod";

/** Mirrors `SeriesChanges` in bookings/edit-booking.ts for untrusted API input. */
export const seriesChangesSchema = z.object({
  frequency: z.enum(["WEEKLY", "BIWEEKLY", "EVERY_4_WEEKS"]).optional(),
  windowId: z.string().min(1).optional(),
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  bedrooms: z.number().int().min(0).max(12).optional(),
  bathrooms: z.number().min(1).max(12).optional(),
  sqft: z.number().int().min(100).max(20000).nullable().optional(),
  extras: z.array(z.object({ slug: z.string(), qty: z.number().int().min(0).max(10) })).optional(),
});
