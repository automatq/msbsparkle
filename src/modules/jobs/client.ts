import { Inngest } from "inngest";

export type Events = {
  "booking/confirmed": { data: { bookingId: string } };
  "job/assigned": { data: { jobId: string; cleanerId: string; offered: boolean } };
  "job/completed": { data: { jobId: string } };
};

export const inngest = new Inngest({ id: "msbsparkle" });

/** Sends an event; never throws (the app keeps working when the Inngest dev server is down). */
export async function emit<K extends keyof Events>(
  name: K,
  data: Events[K]["data"],
): Promise<boolean> {
  // No transport configured (neither the local dev server nor a cloud event key): skip quietly.
  if (!process.env.INNGEST_DEV && !process.env.INNGEST_EVENT_KEY) return false;
  try {
    await inngest.send({ name, data });
    return true;
  } catch (e) {
    console.warn(`[inngest] could not send ${name}:`, e instanceof Error ? e.message : e);
    return false;
  }
}
