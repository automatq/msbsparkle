import { describe, expect, it } from "vitest";
import {
  addLocalDays,
  formatInZone,
  todayIn,
  tzOffsetMinutes,
  weekdayOf,
  zonedToInstant,
} from "./dates";

describe("zonedToInstant", () => {
  it("converts Toronto wall-clock to UTC in summer (EDT, -4)", () => {
    expect(zonedToInstant("2026-07-01", "08:00", "America/Toronto").toISOString()).toBe(
      "2026-07-01T12:00:00.000Z",
    );
  });
  it("converts Toronto wall-clock to UTC in winter (EST, -5)", () => {
    expect(zonedToInstant("2026-01-15", "08:00", "America/Toronto").toISOString()).toBe(
      "2026-01-15T13:00:00.000Z",
    );
  });
  it("converts Edmonton wall-clock (MST, -7 in winter)", () => {
    expect(zonedToInstant("2026-01-15", "08:00", "America/Edmonton").toISOString()).toBe(
      "2026-01-15T15:00:00.000Z",
    );
  });
  it("keeps 8am local on either side of the spring-forward day", () => {
    // 2026-03-08 is the spring-forward day in Toronto.
    expect(zonedToInstant("2026-03-07", "08:00", "America/Toronto").toISOString()).toBe(
      "2026-03-07T13:00:00.000Z",
    );
    expect(zonedToInstant("2026-03-08", "08:00", "America/Toronto").toISOString()).toBe(
      "2026-03-08T12:00:00.000Z",
    );
  });
  it("agrees with Intl for whatever tzdata says about a given date", () => {
    // Guards against library drift: whatever the runtime's tzdata believes, we must match it.
    const instant = zonedToInstant("2026-11-02", "08:00", "America/Vancouver");
    expect(formatInZone(instant, "America/Vancouver", "yyyy-MM-dd HH:mm")).toBe("2026-11-02 08:00");
  });
});

describe("tzOffsetMinutes", () => {
  it("reports -240 for Toronto in July and -300 in January", () => {
    expect(tzOffsetMinutes(new Date("2026-07-01T12:00:00Z"), "America/Toronto")).toBe(-240);
    expect(tzOffsetMinutes(new Date("2026-01-15T12:00:00Z"), "America/Toronto")).toBe(-300);
  });
});

describe("todayIn", () => {
  it("is region-local, not server-local", () => {
    const at = new Date("2026-10-04T03:30:00.000Z"); // 23:30 Oct 3 in Toronto
    expect(todayIn("America/Toronto", at)).toBe("2026-10-03");
    expect(todayIn("UTC", at)).toBe("2026-10-04");
  });
});

describe("date helpers", () => {
  it("adds days across month boundaries and computes weekday", () => {
    expect(addLocalDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addLocalDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(weekdayOf("2026-09-25")).toBe(5); // Friday
  });
});
