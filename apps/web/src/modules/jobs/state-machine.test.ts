import { describe, expect, it } from "vitest";
import { JOB_TRANSITIONS, canTransition } from "./state-machine";

describe("job state machine", () => {
  it("allows the happy path", () => {
    expect(canTransition("CONFIRMED", "ASSIGNED")).toBe(true);
    expect(canTransition("ASSIGNED", "IN_PROGRESS")).toBe(true);
    expect(canTransition("IN_PROGRESS", "COMPLETED")).toBe(true);
  });
  it("blocks leaving terminal states", () => {
    for (const s of ["CANCELLED", "SKIPPED", "NO_SHOW"] as const)
      expect(JOB_TRANSITIONS[s]).toEqual([]);
    expect(canTransition("CANCELLED", "CONFIRMED")).toBe(false);
  });
  it("blocks skipping steps", () => {
    expect(canTransition("CONFIRMED", "COMPLETED")).toBe(false);
    expect(canTransition("PENDING", "IN_PROGRESS")).toBe(false);
  });
});
