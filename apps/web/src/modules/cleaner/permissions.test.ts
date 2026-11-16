import { describe, expect, it } from "vitest";
import { permissionsFor } from "./permissions";

const at = new Date("2026-11-16T15:00:00Z");
const state = (
  status: string,
  jobStatus: string,
  opts: { checkInAt?: Date | null; checkOutAt?: Date | null } = {},
) => ({
  status,
  checkInAt: opts.checkInAt ?? null,
  checkOutAt: opts.checkOutAt ?? null,
  job: { status: jobStatus },
});

describe("cleaner permissions", () => {
  it("an offer can only be answered: no progress, checklist, photos or customer details", () => {
    const can = permissionsFor(state("OFFERED", "CONFIRMED"));
    expect(can).toMatchObject({
      canRespond: true,
      isOpen: false,
      canGoEnRoute: false,
      canCheckIn: false,
      canEditChecklist: false,
      canAddPhotos: false,
      canSeeCustomer: false,
      canSeePhotos: false,
    });
  });

  it("an offer on a cancelled job can't be answered", () => {
    expect(permissionsFor(state("OFFERED", "CANCELLED")).canRespond).toBe(false);
  });

  it("accepted, before check-in: on my way (only when ASSIGNED), check-in and photos", () => {
    const can = permissionsFor(state("ACCEPTED", "ASSIGNED"));
    expect(can).toMatchObject({
      canGoEnRoute: true,
      canCheckIn: true,
      canCheckOut: false,
      canEditChecklist: false,
      canAddPhotos: true,
      canSeeCustomer: true,
    });
    expect(permissionsFor(state("ACCEPTED", "EN_ROUTE")).canGoEnRoute).toBe(false);
  });

  it("checked in: checklist and check-out open up, check-in closes", () => {
    const can = permissionsFor(state("ACCEPTED", "IN_PROGRESS", { checkInAt: at }));
    expect(can).toMatchObject({
      canCheckIn: false,
      canCheckOut: true,
      canEditChecklist: true,
      canAddPhotos: true,
    });
  });

  it("checked out: nothing more can change, but the job stays visible", () => {
    const can = permissionsFor(state("ACCEPTED", "IN_PROGRESS", { checkInAt: at, checkOutAt: at }));
    expect(can).toMatchObject({
      isOpen: true,
      canCheckOut: false,
      canEditChecklist: false,
      canAddPhotos: false,
      canSeePhotos: true,
    });
  });

  it.each(["COMPLETED", "CANCELLED", "SKIPPED", "NO_SHOW"])("a %s job is read-only", (s) => {
    const can = permissionsFor(state("ACCEPTED", s, { checkInAt: at }));
    expect(can.isOpen).toBe(false);
    expect(can.canCheckOut || can.canEditChecklist || can.canAddPhotos).toBe(false);
  });
});
