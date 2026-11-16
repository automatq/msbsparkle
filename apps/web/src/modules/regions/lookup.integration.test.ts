/**
 * Integration tests against the seeded database. Skipped when DATABASE_URL is unset.
 */
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/modules/db/client";
import { findServiceArea } from "./lookup";

const enabled = !!process.env.DATABASE_URL;
const PREFIXES = ["99901", "999"];

describe.skipIf(!enabled)("service area lookup (integration)", () => {
  afterAll(async () => {
    await prisma.serviceArea.deleteMany({ where: { postalPrefix: { in: PREFIXES } } });
  });

  it("prefers the most specific prefix and ignores inactive areas", async () => {
    const [broad, narrow] = await prisma.region.findMany({
      where: { status: "ACTIVE" },
      take: 2,
      orderBy: { slug: "asc" },
    });
    await prisma.serviceArea.createMany({
      data: [
        { regionId: broad.id, postalPrefix: "999" },
        { regionId: narrow.id, postalPrefix: "99901" },
      ],
    });

    const exact = await findServiceArea({ postalCode: "99901", prefixes: ["99901", "999"] });
    expect(exact?.regionId).toBe(narrow.id);

    const fallback = await findServiceArea({ postalCode: "99950", prefixes: ["99950", "999"] });
    expect(fallback?.regionId).toBe(broad.id);

    await prisma.serviceArea.update({ where: { postalPrefix: "99901" }, data: { active: false } });
    const inactive = await findServiceArea({ postalCode: "99901", prefixes: ["99901", "999"] });
    expect(inactive?.regionId).toBe(broad.id);
  });
});
