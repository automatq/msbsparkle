import { prisma } from "@/modules/db/client";

export const SERVICE_COPY: Record<string, { tagline: string; includes: string[]; ideal: string }> =
  {
    standard: {
      tagline: "Reliable upkeep for busy homes.",
      includes: [
        "Kitchen counters, stovetop, sink and appliance exteriors",
        "Bathrooms: toilet, tub, shower, sink, mirrors",
        "Dusting, vacuuming and mopping throughout",
        "Beds made, trash emptied",
      ],
      ideal: "Weekly, bi-weekly or monthly maintenance.",
    },
    deep: {
      tagline: "A top-to-bottom reset.",
      includes: [
        "Everything in a standard clean",
        "Baseboards, door frames, switch plates",
        "Inside microwave, cabinet fronts, range hood",
        "Light fixtures and ceiling fans",
        "Grout and tile detail",
      ],
      ideal: "First cleans, spring cleaning, or every few months.",
    },
    "move-in-out": {
      tagline: "Leave it spotless, or start fresh.",
      includes: [
        "Everything in a deep clean",
        "Inside all cabinets, closets and drawers",
        "Inside fridge and oven",
        "Walls spot-cleaned, windows interior",
      ],
      ideal: "Empty homes between tenants or owners.",
    },
    condo: {
      tagline: "Built for condos and apartments.",
      includes: [
        "Standard clean scoped for smaller spaces",
        "Balcony sweep on request",
        "Concierge and lockbox friendly",
      ],
      ideal: "Downtown units and rentals.",
    },
    "post-renovation": {
      tagline: "Dust-free after the work is done.",
      includes: [
        "Fine dust removal from all surfaces",
        "Vents, ledges and light fixtures",
        "Floors detailed, windows interior",
        "Debris and residue wiped",
      ],
      ideal: "After contractors leave.",
    },
    airbnb: {
      tagline: "Guest-ready between stays.",
      includes: [
        "Full turnover clean",
        "Linen change and towel reset",
        "Restock check and photo report",
      ],
      ideal: "Short-term rental hosts.",
    },
    office: {
      tagline: "Clean workplaces, billed hourly.",
      includes: [
        "Desks, common areas, kitchens and washrooms",
        "Trash and recycling",
        "After-hours scheduling",
      ],
      ideal: "Small offices, clinics and studios.",
    },
    hourly: {
      tagline: "You set the priorities.",
      includes: [
        "Book by the hour, 3-hour minimum",
        "Tell us what matters most",
        "Great for organizing and odd jobs",
      ],
      ideal: "Custom requests.",
    },
  };

export async function activeCities() {
  return prisma.city.findMany({
    where: { active: true, region: { status: "ACTIVE" } },
    include: { region: true },
    orderBy: [{ province: "asc" }, { name: "asc" }],
  });
}

export async function cityBySlug(slug: string) {
  return prisma.city.findUnique({
    where: { slug },
    include: {
      region: {
        include: {
          cities: { where: { active: true }, orderBy: { name: "asc" } },
          windows: { where: { active: true }, orderBy: { sortOrder: "asc" } },
        },
      },
    },
  });
}

export async function publicReviews(regionId?: string, take = 12) {
  return prisma.review.findMany({
    where: { isPublic: true, rating: { gte: 4 }, ...(regionId ? { job: { regionId } } : {}) },
    include: {
      customer: { select: { firstName: true, lastName: true } },
      cleaner: { select: { firstName: true } },
      job: { include: { service: true, region: true } },
    },
    orderBy: { createdAt: "desc" },
    take,
  });
}

export async function orgSettings() {
  const org = await prisma.organization.findFirstOrThrow();
  const s = (org.settings ?? {}) as {
    supportEmail?: string;
    supportPhone?: string;
    googleRating?: number;
    googleReviewCount?: number;
    totalFiveStar?: number;
  };
  return {
    orgId: org.id,
    name: org.name,
    supportEmail: s.supportEmail ?? "hello@example.com",
    supportPhone: s.supportPhone ?? "",
    googleRating: s.googleRating ?? 4.8,
    googleReviewCount: s.googleReviewCount ?? 0,
  };
}

export function jsonLd(obj: object): string {
  return JSON.stringify(obj).replace(/</g, "\\u003c");
}
