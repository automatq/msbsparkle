import { describe, expect, it } from "vitest";
import { rankCleaners, type CandidateCleaner } from "./ranking";

const job = {
  date: "2026-10-05",
  windowStartLocal: "08:00",
  windowEndLocal: "10:00",
  estimatedMinutes: 180,
  requiredSkill: null,
};
const base: CandidateCleaner = {
  id: "a",
  firstName: "A",
  status: "ACTIVE",
  servesRegion: true,
  skills: [],
  ratingAvg: null,
  ratingCount: 0,
  maxJobsPerDay: 3,
  availability: [{ startLocal: "08:00", endLocal: "17:00" }],
  onTimeOff: false,
  jobsThatDay: 0,
  conflicts: 0,
  completedForCustomer: 0,
  isPreferred: false,
};

describe("rankCleaners", () => {
  it("puts the preferred cleaner first, then repeat cleaners, then rating", () => {
    const r = rankCleaners(job, [
      { ...base, id: "rated", firstName: "Rated", ratingAvg: 4.9, ratingCount: 20 },
      { ...base, id: "repeat", firstName: "Repeat", completedForCustomer: 3 },
      { ...base, id: "pref", firstName: "Pref", isPreferred: true },
    ]);
    expect(r.map((x) => x.id)).toEqual(["pref", "repeat", "rated"]);
    expect(r[0].reasons).toContain("customer's preferred cleaner");
  });
  it("marks conflicts, time off, inactive and other regions as ineligible and sorts them last", () => {
    const r = rankCleaners(job, [
      { ...base, id: "busy", conflicts: 1, ratingAvg: 5, ratingCount: 50 },
      { ...base, id: "off", onTimeOff: true },
      { ...base, id: "free" },
    ]);
    expect(r[0].id).toBe("free");
    expect(r.find((x) => x.id === "busy")!.eligible).toBe(false);
    expect(r.find((x) => x.id === "busy")!.warnings[0]).toMatch(/overlaps/);
  });
  it("penalizes missing skills and daily limits but keeps them eligible", () => {
    const r = rankCleaners({ ...job, requiredSkill: "DEEP_CLEAN" }, [
      { ...base, id: "skilled", skills: ["DEEP_CLEAN"], jobsThatDay: 3 },
      { ...base, id: "unskilled" },
    ]);
    expect(r.every((x) => x.eligible)).toBe(true);
    expect(r.find((x) => x.id === "unskilled")!.warnings).toContain("no deep clean skill");
    expect(r.find((x) => x.id === "skilled")!.warnings[0]).toMatch(/daily limit/);
  });
  it("requires availability to cover the whole estimated job, not just the window", () => {
    const r = rankCleaners({ ...job, estimatedMinutes: 300 }, [
      { ...base, id: "short", availability: [{ startLocal: "08:00", endLocal: "12:00" }] },
    ]);
    expect(r[0].warnings).toContain("outside usual hours");
  });
});
