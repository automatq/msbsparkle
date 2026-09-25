import type { Province } from "@/generated/prisma/enums";
import { prisma } from "@/modules/db/client";
import { localDateToDateColumn } from "@/modules/shared/dates";
import type { TaxLine } from "./types";

/** Tax lines effective in a province on a local service date. */
export async function getTaxLines(province: Province, serviceDate: string): Promise<TaxLine[]> {
  const on = localDateToDateColumn(serviceDate);
  const rows = await prisma.taxRate.findMany({
    where: {
      province,
      effectiveFrom: { lte: on },
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: on } }],
    },
    orderBy: { name: "asc" },
  });
  return rows.map((r) => ({ name: r.name, rateBps: r.rateBps, taxRateId: r.id }));
}
