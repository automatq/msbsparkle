"use server";

import { z } from "zod";
import { prisma } from "@/modules/db/client";
import { normalizePhone } from "@/modules/notifications/sms";

const applicationSchema = z.object({
  firstName: z.string().trim().min(1).max(60),
  lastName: z.string().trim().min(1).max(60),
  email: z.string().trim().email(),
  phone: z.string().trim().min(7),
  city: z.string().trim().min(1).max(80),
  experience: z.string().trim().max(2000).optional(),
  hasVehicle: z.boolean().optional(),
});

export async function submitApplicationAction(
  raw: unknown,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const parsed = applicationSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: "Please check the form." };
  const d = parsed.data;
  const org = await prisma.organization.findFirstOrThrow({ select: { id: true } });
  const region = await prisma.region.findFirst({
    where: {
      organizationId: org.id,
      OR: [
        { name: { equals: d.city, mode: "insensitive" } },
        { cities: { some: { name: { equals: d.city, mode: "insensitive" } } } },
      ],
    },
  });
  await prisma.cleanerApplication.create({
    data: {
      organizationId: org.id,
      regionId: region?.id ?? null,
      firstName: d.firstName,
      lastName: d.lastName,
      email: d.email.toLowerCase(),
      phone: normalizePhone(d.phone) ?? d.phone,
      city: d.city,
      experience: d.experience || null,
      hasVehicle: d.hasVehicle ?? null,
    },
  });
  return { ok: true };
}
