import { describe, expect, it, vi } from "vitest";
import { createPhotoQueue, MAX_ATTEMPTS, type QueuedPhoto, type UploadOutcome } from "./queue-core";

function memory() {
  let items: QueuedPhoto[] = [];
  return {
    load: async () => items.map((i) => ({ ...i })),
    save: async (next: QueuedPhoto[]) => {
      items = next.map((i) => ({ ...i }));
    },
  };
}
const photo = (n: number) => ({
  clientId: `c-${n}`,
  jobId: "j1",
  kind: "AFTER" as const,
  uri: `file://${n}.jpg`,
});

describe("photo queue", () => {
  it("uploads in order and empties the queue", async () => {
    const seen: string[] = [];
    const q = createPhotoQueue({
      storage: memory(),
      upload: async (i) => (seen.push(i.clientId), { ok: true }),
    });
    await q.add(photo(1));
    await q.add(photo(2));
    await q.add(photo(1)); // same client id: not queued twice
    await q.flush();
    expect(seen).toEqual(["c-1", "c-2"]);
    expect(await q.pending()).toEqual([]);
  });

  it("keeps items when offline and stops at the first failure", async () => {
    const upload = vi.fn(async (): Promise<UploadOutcome> => ({
      ok: false,
      retry: true,
      error: "offline",
    }));
    const q = createPhotoQueue({ storage: memory(), upload });
    await q.add(photo(1));
    await q.add(photo(2));
    await q.flush();
    expect(upload).toHaveBeenCalledTimes(1);
    const left = await q.pending();
    expect(left.map((i) => [i.clientId, i.attempts])).toEqual([
      ["c-1", 1],
      ["c-2", 0],
    ]);
  });

  it("drops items the server refused, and gives up after many attempts", async () => {
    const q = createPhotoQueue({
      storage: memory(),
      upload: async (i) =>
        i.clientId === "c-1"
          ? { ok: false, retry: false, error: "job closed" }
          : { ok: false, retry: true, error: "x" },
    });
    await q.add(photo(1));
    await q.flush();
    expect(await q.pending()).toEqual([]);
    await q.add(photo(2));
    for (let n = 0; n < MAX_ATTEMPTS; n++) await q.flush();
    expect(await q.pending()).toEqual([]);
  });

  it("shares one run between concurrent flushes", async () => {
    const upload = vi.fn(async (): Promise<UploadOutcome> => ({ ok: true }));
    const q = createPhotoQueue({ storage: memory(), upload });
    await q.add(photo(1));
    await Promise.all([q.flush(), q.flush(), q.flush()]);
    expect(upload).toHaveBeenCalledTimes(1);
  });
});
