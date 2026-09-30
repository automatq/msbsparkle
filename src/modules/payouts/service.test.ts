import { describe, expect, it } from "vitest";
import { lastCompletedWeek } from "./service";

describe("lastCompletedWeek", () => {
  it("returns the previous Monday–Sunday", () => {
    expect(lastCompletedWeek("2026-09-30")).toEqual({ start: "2026-09-21", end: "2026-09-27" }); // Wed
    expect(lastCompletedWeek("2026-09-28")).toEqual({ start: "2026-09-21", end: "2026-09-27" }); // Mon
    expect(lastCompletedWeek("2026-09-27")).toEqual({ start: "2026-09-14", end: "2026-09-20" }); // Sun
  });
});
