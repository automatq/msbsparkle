import type { RateKind } from "@/generated/prisma/enums";
import { prisma } from "@/modules/db/client";
import type { RateValue, ResolvedRates } from "./types";

type Row = {
  kind: RateKind;
  key: string;
  amountCents: number | null;
  bps: number | null;
  minutes: number | null;
};

export function buildRates(
  pricingTableId: string,
  orgRows: Row[],
  regionRows: Row[],
): ResolvedRates {
  const map = new Map<string, RateValue>();
  for (const r of orgRows) map.set(`${r.kind}:${r.key}`, r);
  for (const r of regionRows) map.set(`${r.kind}:${r.key}`, r); // region overrides
  return { pricingTableId, get: (kind, key) => map.get(`${kind}:${key}`) };
}

/**
 * Region-specific published table (latest effective) merged over the org default.
 * `pricingTableId` is the region table when one exists, else the org table.
 */
export async function resolveRates(
  organizationId: string,
  regionId: string,
  at: Date = new Date(),
): Promise<ResolvedRates> {
  const [orgTable, regionTable] = await Promise.all([
    prisma.pricingTable.findFirst({
      where: { organizationId, regionId: null, status: "PUBLISHED", effectiveFrom: { lte: at } },
      orderBy: [{ effectiveFrom: "desc" }, { version: "desc" }],
      include: { rates: true },
    }),
    prisma.pricingTable.findFirst({
      where: { organizationId, regionId, status: "PUBLISHED", effectiveFrom: { lte: at } },
      orderBy: [{ effectiveFrom: "desc" }, { version: "desc" }],
      include: { rates: true },
    }),
  ]);
  if (!orgTable && !regionTable) throw new Error("No published pricing table");
  return buildRates((regionTable ?? orgTable)!.id, orgTable?.rates ?? [], regionTable?.rates ?? []);
}
