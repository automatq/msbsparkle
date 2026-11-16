import { describe, expect, it } from "vitest";
import { occurrences } from "./recurrence";

describe("occurrences", () => {
  it("one-time yields exactly the anchor", () => {
    expect(
      occurrences({ frequency: "ONE_TIME", anchorDate: "2026-10-03", through: "2027-01-01" }),
    ).toEqual([{ date: "2026-10-03", sequenceNumber: 1 }]);
  });
  it("biweekly rolls forward through the horizon with stable sequence numbers", () => {
    const list = occurrences({
      frequency: "BIWEEKLY",
      anchorDate: "2026-10-03",
      through: "2026-11-30",
    });
    expect(list.map((o) => o.date)).toEqual([
      "2026-10-03",
      "2026-10-17",
      "2026-10-31",
      "2026-11-14",
      "2026-11-28",
    ]);
    expect(list.at(-1)?.sequenceNumber).toBe(5);
  });
  it("respects the cursor, pause range and end date", () => {
    const list = occurrences({
      frequency: "WEEKLY",
      anchorDate: "2026-10-03",
      after: "2026-10-10",
      through: "2026-12-31",
      pausedFrom: "2026-10-20",
      pausedUntil: "2026-11-05",
      endsOn: "2026-11-20",
    });
    expect(list.map((o) => o.date)).toEqual(["2026-10-17", "2026-11-07", "2026-11-14"]);
    expect(list[0].sequenceNumber).toBe(3);
  });
});
