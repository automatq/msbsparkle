import { describe, expect, it } from "vitest";
import { computeAvailability, type AvailabilityInputs } from "./availability";

const windows = [
  { id: "w8", label: "8–10", startLocal: "08:00", endLocal: "10:00" },
  { id: "w14", label: "2–4", startLocal: "14:00", endLocal: "16:00" },
];

function inputs(over: Partial<AvailabilityInputs> = {}): AvailabilityInputs {
  return {
    timezone: "America/Toronto",
    minLeadHours: 24,
    maxAdvanceDays: 60,
    windows,
    fromDate: "2026-10-05",
    toDate: "2026-10-07",
    now: new Date("2026-10-05T12:30:00Z"), // 08:30 Toronto, Monday Oct 5
    capacityFor: () => 3,
    blackouts: [],
    booked: new Map(),
    ...over,
  };
}

describe("computeAvailability", () => {
  it("closes windows inside the lead-time cutoff", () => {
    const days = computeAvailability(inputs());
    const mon = days[0].windows;
    expect(mon.every((w) => w.reason === "LEAD_TIME")).toBe(true);
    const tue = days[1].windows;
    expect(tue[0].reason).toBe("LEAD_TIME"); // Tue 08:00 is 23.5h away
    expect(tue[1].open).toBe(true);
  });
  it("subtracts booked jobs and marks full", () => {
    const booked = new Map([
      ["2026-10-07|08:00", 3],
      ["2026-10-07|14:00", 1],
    ]);
    const [, , wed] = computeAvailability(inputs({ booked }));
    expect(wed.windows[0]).toMatchObject({ open: false, remaining: 0, reason: "FULL" });
    expect(wed.windows[1]).toMatchObject({ open: true, remaining: 2 });
  });
  it("honours blackouts for a whole day or one window", () => {
    const [, , wed] = computeAvailability(
      inputs({ blackouts: [{ date: "2026-10-07", windowId: "w14" }] }),
    );
    expect(wed.windows[0].open).toBe(true);
    expect(wed.windows[1].reason).toBe("BLACKOUT");
  });
  it("closes dates beyond maxAdvanceDays and before today", () => {
    const days = computeAvailability(
      inputs({ fromDate: "2026-10-04", toDate: "2026-12-10", maxAdvanceDays: 30 }),
    );
    expect(days[0].windows[0].reason).toBe("OUT_OF_RANGE");
    expect(days.at(-1)?.windows[0].reason).toBe("OUT_OF_RANGE");
  });
});
