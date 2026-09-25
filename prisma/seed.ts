/* Idempotent seed: organization, tax rates, regions + FSAs + windows + capacity,
 * services, extras, default pricing table, super admin, and (dev only) demo data. */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { PrismaClient } from "../src/generated/prisma/client";
import type { Province, RateKind } from "../src/generated/prisma/enums";
import { hashPassword } from "../src/modules/auth/password";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const ORG_SLUG = "msb-sparkle";
const FSA_LETTERS = "ABCEGHJKLMNPRSTVWXYZ".split(""); // valid 3rd chars of an FSA (no D,F,I,O,Q,U)

type RegionSeed = {
  slug: string;
  name: string;
  province: Province;
  timezone: string;
  phone: string;
  fsaPrefixes: string[]; // 2-char prefixes, expanded with FSA_LETTERS
  fsaExtra?: string[]; // explicit FSAs
  fsaExclude?: string[];
  cities: { name: string; slug: string }[];
};

const REGIONS: RegionSeed[] = [
  {
    slug: "toronto",
    name: "Toronto",
    province: "ON",
    timezone: "America/Toronto",
    phone: "+1 416 555 0100",
    fsaPrefixes: ["M4", "M5", "M6"],
    cities: [
      { name: "Toronto", slug: "toronto" },
      { name: "North York", slug: "north-york" },
      { name: "Scarborough", slug: "scarborough" },
      { name: "Etobicoke", slug: "etobicoke" },
    ],
  },
  {
    slug: "mississauga",
    name: "Mississauga",
    province: "ON",
    timezone: "America/Toronto",
    phone: "+1 905 555 0100",
    fsaPrefixes: ["L5"],
    fsaExtra: ["L4T", "L4V", "L4W", "L4X", "L4Y", "L4Z"],
    cities: [
      { name: "Mississauga", slug: "mississauga" },
      { name: "Brampton", slug: "brampton" },
      { name: "Oakville", slug: "oakville" },
    ],
  },
  {
    slug: "ottawa",
    name: "Ottawa",
    province: "ON",
    timezone: "America/Toronto",
    phone: "+1 613 555 0100",
    fsaPrefixes: ["K1", "K2"],
    cities: [
      { name: "Ottawa", slug: "ottawa" },
      { name: "Kanata", slug: "kanata" },
      { name: "Nepean", slug: "nepean" },
    ],
  },
  {
    slug: "hamilton",
    name: "Hamilton",
    province: "ON",
    timezone: "America/Toronto",
    phone: "+1 905 555 0200",
    fsaPrefixes: ["L8"],
    fsaExtra: ["L9A", "L9B", "L9C", "L9G", "L9H", "L9K"],
    cities: [
      { name: "Hamilton", slug: "hamilton" },
      { name: "Burlington", slug: "burlington" },
    ],
  },
  {
    slug: "london",
    name: "London",
    province: "ON",
    timezone: "America/Toronto",
    phone: "+1 519 555 0100",
    fsaPrefixes: ["N6"],
    fsaExtra: ["N5V", "N5W", "N5X", "N5Y", "N5Z"],
    cities: [{ name: "London", slug: "london" }],
  },
  {
    slug: "kitchener-waterloo",
    name: "Kitchener-Waterloo",
    province: "ON",
    timezone: "America/Toronto",
    phone: "+1 519 555 0200",
    fsaPrefixes: ["N2"],
    cities: [
      { name: "Kitchener", slug: "kitchener" },
      { name: "Waterloo", slug: "waterloo" },
      { name: "Cambridge", slug: "cambridge" },
    ],
  },
  {
    slug: "calgary",
    name: "Calgary",
    province: "AB",
    timezone: "America/Edmonton",
    phone: "+1 403 555 0100",
    fsaPrefixes: ["T2", "T3"],
    cities: [
      { name: "Calgary", slug: "calgary" },
      { name: "Airdrie", slug: "airdrie" },
    ],
  },
  {
    slug: "edmonton",
    name: "Edmonton",
    province: "AB",
    timezone: "America/Edmonton",
    phone: "+1 780 555 0100",
    fsaPrefixes: ["T5", "T6"],
    cities: [
      { name: "Edmonton", slug: "edmonton" },
      { name: "St. Albert", slug: "st-albert" },
      { name: "Sherwood Park", slug: "sherwood-park" },
    ],
  },
  {
    slug: "vancouver",
    name: "Vancouver",
    province: "BC",
    timezone: "America/Vancouver",
    phone: "+1 604 555 0100",
    fsaPrefixes: ["V6"],
    fsaExtra: [
      "V5K",
      "V5L",
      "V5M",
      "V5N",
      "V5P",
      "V5R",
      "V5S",
      "V5T",
      "V5V",
      "V5W",
      "V5X",
      "V5Y",
      "V5Z",
    ],
    cities: [
      { name: "Vancouver", slug: "vancouver" },
      { name: "Richmond", slug: "richmond" },
      { name: "North Vancouver", slug: "north-vancouver" },
    ],
  },
  {
    slug: "burnaby",
    name: "Burnaby",
    province: "BC",
    timezone: "America/Vancouver",
    phone: "+1 604 555 0200",
    fsaPrefixes: [],
    fsaExtra: ["V5A", "V5B", "V5C", "V5E", "V5G", "V5H", "V5J", "V3J", "V3N"],
    cities: [
      { name: "Burnaby", slug: "burnaby" },
      { name: "New Westminster", slug: "new-westminster" },
      { name: "Coquitlam", slug: "coquitlam" },
    ],
  },
];

const WINDOWS = [
  { label: "8am – 10am", startLocal: "08:00", endLocal: "10:00" },
  { label: "10am – 12pm", startLocal: "10:00", endLocal: "12:00" },
  { label: "12pm – 2pm", startLocal: "12:00", endLocal: "14:00" },
  { label: "2pm – 4pm", startLocal: "14:00", endLocal: "16:00" },
];

const SERVICES = [
  {
    slug: "standard",
    name: "Standard Cleaning",
    pricingModel: "FLAT",
    sortOrder: 1,
    description: "Recurring or one-time upkeep for kitchens, bathrooms, bedrooms and living areas.",
  },
  {
    slug: "deep",
    name: "Deep Cleaning",
    pricingModel: "FLAT",
    isUpgrade: true,
    sortOrder: 2,
    description:
      "Everything in a standard clean plus baseboards, cabinet fronts, light fixtures and grime build-up.",
  },
  {
    slug: "move-in-out",
    name: "Move-In / Move-Out Cleaning",
    pricingModel: "FLAT",
    isUpgrade: true,
    sortOrder: 3,
    description: "Empty-home clean including inside cabinets, closets and appliances.",
  },
  {
    slug: "condo",
    name: "Condo & Apartment Cleaning",
    pricingModel: "FLAT",
    sortOrder: 4,
    description: "Tailored for condos and apartments.",
  },
  {
    slug: "post-renovation",
    name: "Post-Renovation Cleaning",
    pricingModel: "FLAT",
    sortOrder: 5,
    description: "Dust and debris removal after construction.",
  },
  {
    slug: "airbnb",
    name: "Airbnb Turnover",
    pricingModel: "FLAT",
    sortOrder: 6,
    description: "Fast turnovers between guests with linen reset.",
  },
  {
    slug: "office",
    name: "Office Cleaning",
    pricingModel: "HOURLY",
    sortOrder: 7,
    description: "Commercial cleaning billed hourly.",
  },
  {
    slug: "hourly",
    name: "Hourly Cleaning",
    pricingModel: "HOURLY",
    sortOrder: 8,
    description: "Book by the hour, 3-hour minimum per cleaner.",
  },
] as const;

const EXTRAS = [
  { slug: "inside-fridge", name: "Inside Fridge", minutes: 30, cents: 3500 },
  { slug: "inside-oven", name: "Inside Oven", minutes: 30, cents: 3500 },
  { slug: "inside-cabinets", name: "Inside Cabinets", minutes: 45, cents: 4500 },
  { slug: "interior-windows", name: "Interior Windows", minutes: 45, cents: 4500 },
  {
    slug: "laundry",
    name: "Laundry (per load)",
    minutes: 30,
    cents: 2500,
    unit: "PER_UNIT",
    maxQty: 3,
  },
  { slug: "dishes", name: "Dishes", minutes: 20, cents: 2000 },
  { slug: "baseboards", name: "Baseboards", minutes: 30, cents: 3500 },
  { slug: "wall-wipe", name: "Wall Wipe-Down", minutes: 45, cents: 4500 },
  { slug: "balcony", name: "Balcony / Patio", minutes: 20, cents: 2500 },
  { slug: "pet-hair", name: "Pet Hair Removal", minutes: 20, cents: 2500 },
  {
    slug: "organizing",
    name: "Organizing (per hour)",
    minutes: 60,
    cents: 4500,
    unit: "PER_UNIT",
    maxQty: 4,
  },
] as const;

type RateSeed = {
  kind: RateKind;
  key: string;
  amountCents?: number;
  bps?: number;
  minutes?: number;
};

function defaultRates(): RateSeed[] {
  const rates: RateSeed[] = [
    { kind: "BASE", key: "standard", amountCents: 9900, minutes: 120 },
    { kind: "BASE", key: "deep", amountCents: 14900, minutes: 180 },
    { kind: "BASE", key: "move-in-out", amountCents: 17900, minutes: 240 },
    { kind: "BASE", key: "condo", amountCents: 9900, minutes: 105 },
    { kind: "BASE", key: "post-renovation", amountCents: 19900, minutes: 240 },
    { kind: "BASE", key: "airbnb", amountCents: 9900, minutes: 90 },
    { kind: "HOURLY_RATE", key: "per-cleaner-hour", amountCents: 5900 },
    { kind: "HOURLY_MIN", key: "min", minutes: 180 },
    { kind: "FIRST_CLEAN_UPGRADE", key: "deep", amountCents: 9900, minutes: 60 },
    { kind: "FIRST_CLEAN_UPGRADE", key: "move-in-out", amountCents: 15900, minutes: 120 },
    { kind: "FREQUENCY_DISCOUNT", key: "WEEKLY", bps: 2000 },
    { kind: "FREQUENCY_DISCOUNT", key: "BIWEEKLY", bps: 1500 },
    { kind: "FREQUENCY_DISCOUNT", key: "EVERY_4_WEEKS", bps: 1000 },
    { kind: "MIN_JOB", key: "min", amountCents: 9900 },
  ];
  const bedrooms = ["0", "1", "2", "3", "4", "5", "6+"];
  bedrooms.forEach((k, i) =>
    rates.push({ kind: "BEDROOM", key: k, amountCents: i * 2000, minutes: i * 20 }),
  );
  const bathrooms = ["1", "1.5", "2", "2.5", "3", "3.5", "4", "5+"];
  bathrooms.forEach((k, i) =>
    rates.push({ kind: "BATHROOM", key: k, amountCents: i * 1500, minutes: i * 15 }),
  );
  const sqft: [string, number, number][] = [
    ["0-999", 0, 0],
    ["1000-1499", 1500, 15],
    ["1500-1999", 3000, 30],
    ["2000-2999", 5000, 45],
    ["3000-3999", 8000, 60],
    ["4000+", 12000, 90],
  ];
  sqft.forEach(([k, c, m]) =>
    rates.push({ kind: "SQFT_BAND", key: k, amountCents: c, minutes: m }),
  );
  EXTRAS.forEach((e) =>
    rates.push({ kind: "EXTRA", key: e.slug, amountCents: e.cents, minutes: e.minutes }),
  );
  return rates;
}

async function ensureRole(
  userId: string,
  role: "SUPER_ADMIN" | "REGION_ADMIN" | "CLEANER" | "CUSTOMER",
  regionId: string | null = null,
) {
  const existing = await prisma.userRole.findFirst({ where: { userId, role, regionId } });
  if (!existing) await prisma.userRole.create({ data: { userId, role, regionId } });
}

function expandFsas(r: RegionSeed): string[] {
  const set = new Set<string>();
  for (const p of r.fsaPrefixes) for (const l of FSA_LETTERS) set.add(`${p}${l}`);
  for (const f of r.fsaExtra ?? []) set.add(f);
  for (const f of r.fsaExclude ?? []) set.delete(f);
  return [...set];
}

async function main() {
  const org = await prisma.organization.upsert({
    where: { slug: ORG_SLUG },
    update: {},
    create: {
      slug: ORG_SLUG,
      name: "MSB Sparkle",
      settings: { supportEmail: "hello@msbsparkle.ca", supportPhone: "1-888-555-0199" },
    },
  });

  // Tax rates (effective 2020-01-01, open ended)
  const taxes: { province: Province; name: string; rateBps: number }[] = [
    { province: "ON", name: "HST", rateBps: 1300 },
    { province: "AB", name: "GST", rateBps: 500 },
    { province: "BC", name: "GST", rateBps: 500 },
    { province: "BC", name: "PST", rateBps: 700 },
  ];
  for (const t of taxes) {
    const existing = await prisma.taxRate.findFirst({
      where: { province: t.province, name: t.name, effectiveTo: null },
    });
    if (!existing)
      await prisma.taxRate.create({
        data: { ...t, effectiveFrom: new Date("2020-01-01T00:00:00Z") },
      });
  }

  // Services & extras
  for (const s of SERVICES) {
    await prisma.service.upsert({
      where: { organizationId_slug: { organizationId: org.id, slug: s.slug } },
      update: {
        name: s.name,
        description: s.description,
        pricingModel: s.pricingModel,
        sortOrder: s.sortOrder,
        isUpgrade: "isUpgrade" in s ? s.isUpgrade : false,
      },
      create: {
        organizationId: org.id,
        slug: s.slug,
        name: s.name,
        description: s.description,
        pricingModel: s.pricingModel,
        sortOrder: s.sortOrder,
        isUpgrade: "isUpgrade" in s ? s.isUpgrade : false,
      },
    });
  }
  for (const [i, e] of EXTRAS.entries()) {
    await prisma.extra.upsert({
      where: { organizationId_slug: { organizationId: org.id, slug: e.slug } },
      update: {
        name: e.name,
        defaultMinutes: e.minutes,
        sortOrder: i,
        unit: "unit" in e ? e.unit : "FIXED",
        maxQty: "maxQty" in e ? e.maxQty : 1,
      },
      create: {
        organizationId: org.id,
        slug: e.slug,
        name: e.name,
        defaultMinutes: e.minutes,
        sortOrder: i,
        unit: "unit" in e ? e.unit : "FIXED",
        maxQty: "maxQty" in e ? e.maxQty : 1,
      },
    });
  }

  // Default (org-wide) pricing table v1
  let table = await prisma.pricingTable.findFirst({
    where: { organizationId: org.id, regionId: null, version: 1 },
  });
  if (!table) {
    table = await prisma.pricingTable.create({
      data: {
        organizationId: org.id,
        regionId: null,
        version: 1,
        status: "PUBLISHED",
        effectiveFrom: new Date("2020-01-01T00:00:00Z"),
        notes: "Initial default rate sheet",
        rates: { create: defaultRates() },
      },
    });
  }

  // Regions
  for (const r of REGIONS) {
    const region = await prisma.region.upsert({
      where: { organizationId_slug: { organizationId: org.id, slug: r.slug } },
      update: { name: r.name, province: r.province, timezone: r.timezone, phone: r.phone },
      create: {
        organizationId: org.id,
        slug: r.slug,
        name: r.name,
        province: r.province,
        timezone: r.timezone,
        phone: r.phone,
        email: `${r.slug}@msbsparkle.ca`,
        status: "ACTIVE",
        launchedAt: new Date(),
        seoTitle: `House Cleaning Services in ${r.name} | MSB Sparkle`,
        seoDescription: `Book trusted, background-checked cleaners in ${r.name}. Instant online pricing, 100% happiness guarantee.`,
      },
    });
    for (const fsa of expandFsas(r)) {
      await prisma.serviceArea.upsert({
        where: { fsa },
        update: { regionId: region.id },
        create: { regionId: region.id, fsa },
      });
    }
    for (const c of r.cities) {
      await prisma.city.upsert({
        where: { slug: c.slug },
        update: { name: c.name, regionId: region.id, province: r.province },
        create: {
          slug: c.slug,
          name: c.name,
          regionId: region.id,
          province: r.province,
          seoTitle: `House Cleaning Services in ${c.name} | MSB Sparkle`,
          seoDescription: `Professional home cleaning in ${c.name}. Get an instant price and book online in 60 seconds.`,
          intro: `Our ${c.name} team delivers reliable, insured house cleaning with flexible scheduling and transparent pricing.`,
          faqs: [
            {
              q: `How much does house cleaning cost in ${c.name}?`,
              a: "Pricing depends on bedrooms, bathrooms and any extras. Use the instant quote tool for an exact price before you book.",
            },
            {
              q: "Do I need to be home?",
              a: "No. Leave entry instructions at checkout and we'll take care of the rest.",
            },
          ],
        },
      });
    }
    for (const [i, w] of WINDOWS.entries()) {
      const window = await prisma.arrivalWindow.upsert({
        where: { regionId_startLocal: { regionId: region.id, startLocal: w.startLocal } },
        update: { label: w.label, endLocal: w.endLocal, sortOrder: i },
        create: {
          regionId: region.id,
          label: w.label,
          startLocal: w.startLocal,
          endLocal: w.endLocal,
          sortOrder: i,
        },
      });
      for (let weekday = 0; weekday <= 6; weekday++) {
        const capacity = weekday === 0 ? 0 : 4;
        const existing = await prisma.windowCapacity.findFirst({
          where: { regionId: region.id, windowId: window.id, weekday },
        });
        if (!existing)
          await prisma.windowCapacity.create({
            data: { regionId: region.id, windowId: window.id, weekday, capacity },
          });
      }
    }
  }

  // Super admin
  const adminEmail = (process.env.SEED_ADMIN_EMAIL ?? "admin@msbsparkle.local").toLowerCase();
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "admin12345!";
  const admin = await prisma.user.upsert({
    where: { organizationId_email: { organizationId: org.id, email: adminEmail } },
    update: {},
    create: {
      organizationId: org.id,
      email: adminEmail,
      name: "Super Admin",
      passwordHash: await hashPassword(adminPassword),
      emailVerified: new Date(),
    },
  });
  await ensureRole(admin.id, "SUPER_ADMIN");

  if (process.env.NODE_ENV !== "production") {
    await seedDemo(org.id);
  }

  console.log(`Seeded org ${org.slug} with ${REGIONS.length} regions. Admin: ${adminEmail}`);
}

async function seedDemo(organizationId: string) {
  const toronto = await prisma.region.findFirstOrThrow({
    where: { organizationId, slug: "toronto" },
  });
  const calgary = await prisma.region.findFirstOrThrow({
    where: { organizationId, slug: "calgary" },
  });

  // Region admin for Calgary
  const regionAdminEmail = "calgary.admin@msbsparkle.local";
  const ra = await prisma.user.upsert({
    where: { organizationId_email: { organizationId, email: regionAdminEmail } },
    update: {},
    create: {
      organizationId,
      email: regionAdminEmail,
      name: "Calgary Admin",
      passwordHash: await hashPassword("admin12345!"),
      emailVerified: new Date(),
    },
  });
  await ensureRole(ra.id, "REGION_ADMIN", calgary.id);

  const cleaners = [
    {
      first: "Amara",
      last: "Okafor",
      region: toronto,
      payType: "PERCENT_OF_JOB",
      payPercentBps: 6000,
    },
    { first: "Daniel", last: "Reyes", region: toronto, payType: "HOURLY", payRateCents: 2800 },
    { first: "Priya", last: "Nair", region: toronto, payType: "FLAT_PER_JOB", payRateCents: 9000 },
    {
      first: "Liam",
      last: "Chen",
      region: calgary,
      payType: "PERCENT_OF_JOB",
      payPercentBps: 6000,
    },
    { first: "Sofia", last: "Marchetti", region: calgary, payType: "HOURLY", payRateCents: 2700 },
  ] as const;
  for (const c of cleaners) {
    const email = `${c.first}.${c.last}@cleaners.msbsparkle.local`.toLowerCase();
    const user = await prisma.user.upsert({
      where: { organizationId_email: { organizationId, email } },
      update: {},
      create: { organizationId, email, name: `${c.first} ${c.last}`, phone: "+14165550000" },
    });
    await ensureRole(user.id, "CLEANER");
    const cleaner = await prisma.cleaner.upsert({
      where: { organizationId_email: { organizationId, email } },
      update: {},
      create: {
        organizationId,
        userId: user.id,
        firstName: c.first,
        lastName: c.last,
        email,
        phone: "+14165550000",
        status: "ACTIVE",
        backgroundCheckStatus: "CLEARED",
        backgroundCheckAt: new Date(),
        homeRegionId: c.region.id,
        payType: c.payType,
        payRateCents: "payRateCents" in c ? c.payRateCents : null,
        payPercentBps: "payPercentBps" in c ? c.payPercentBps : null,
        regions: { create: { regionId: c.region.id } },
        skills: { create: [{ skill: "DEEP_CLEAN" }, { skill: "MOVE_OUT" }] },
      },
    });
    const existingAvail = await prisma.cleanerAvailability.count({
      where: { cleanerId: cleaner.id },
    });
    if (existingAvail === 0) {
      await prisma.cleanerAvailability.createMany({
        data: [1, 2, 3, 4, 5].map((weekday) => ({
          cleanerId: cleaner.id,
          weekday,
          startLocal: "08:00",
          endLocal: "17:00",
          effectiveFrom: new Date("2020-01-01T00:00:00Z"),
        })),
      });
    }
  }

  const customers = [
    {
      first: "Jordan",
      last: "Blake",
      email: "jordan@example.com",
      region: toronto,
      line1: "120 King St W",
      city: "Toronto",
      province: "ON",
      postal: "M5H 1A1",
    },
    {
      first: "Taylor",
      last: "Singh",
      email: "taylor@example.com",
      region: calgary,
      line1: "800 3 St SW",
      city: "Calgary",
      province: "AB",
      postal: "T2P 0G7",
    },
  ] as const;
  for (const c of customers) {
    const customer = await prisma.customer.upsert({
      where: { organizationId_email: { organizationId, email: c.email } },
      update: {},
      create: {
        organizationId,
        firstName: c.first,
        lastName: c.last,
        email: c.email,
        phone: "+14165551234",
        source: "seed",
      },
    });
    const existing = await prisma.address.count({ where: { customerId: customer.id } });
    if (existing === 0) {
      await prisma.address.create({
        data: {
          customerId: customer.id,
          regionId: c.region.id,
          line1: c.line1,
          city: c.city,
          province: c.province,
          postalCode: c.postal,
          fsa: c.postal.slice(0, 3),
          isDefault: true,
        },
      });
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
