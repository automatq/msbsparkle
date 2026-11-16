/** What a cleaner may do on a job. Pure: shared by the service, pages and the mobile API. */

/** Statuses after which nothing on the job can change. */
const CLOSED_JOB = ["COMPLETED", "CANCELLED", "SKIPPED", "NO_SHOW"] as const;
export const isClosed = (status: string) => (CLOSED_JOB as readonly string[]).includes(status);

type AssignmentState = {
  status: string;
  checkInAt: Date | null;
  checkOutAt: Date | null;
  job: { status: string };
};

/** What the cleaner may do on a job right now. The UI and the server use the same rules. */
export function permissionsFor(a: AssignmentState) {
  const accepted = a.status === "ACCEPTED";
  const open = accepted && !isClosed(a.job.status);
  const working = open && !!a.checkInAt && !a.checkOutAt;
  return {
    /** Accepted and the job is still open: the progress controls apply. */
    isOpen: open,
    canRespond: a.status === "OFFERED" && !isClosed(a.job.status),
    canGoEnRoute: open && !a.checkInAt && a.job.status === "ASSIGNED",
    canCheckIn: open && !a.checkInAt,
    canCheckOut: working,
    canEditChecklist: working,
    canAddPhotos: open && !a.checkOutAt,
    canSeeCustomer: accepted,
    canSeePhotos: accepted,
  };
}
export type CleanerPermissions = ReturnType<typeof permissionsFor>;
