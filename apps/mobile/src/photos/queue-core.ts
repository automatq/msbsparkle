/**
 * A persisted upload queue for job photos, so a photo taken in a basement with no signal still
 * arrives. Each item has a client id; the server treats a repeated id as the same photo, so
 * retrying after an unclear failure never creates duplicates.
 */
import type { PhotoKind } from "@msb/shared/mobile-api";

export type QueuedPhoto = {
  clientId: string;
  jobId: string;
  kind: PhotoKind;
  uri: string; // resized local JPEG
  attempts: number;
  lastError?: string;
};

export interface QueueStorage {
  load(): Promise<QueuedPhoto[]>;
  save(items: QueuedPhoto[]): Promise<void>;
}

/** "retry" keeps the item (offline, 5xx, 429, 401); "drop" removes it (the server refused it). */
export type UploadOutcome = { ok: true } | { ok: false; retry: boolean; error: string };

export const MAX_ATTEMPTS = 20;

export function createPhotoQueue(deps: {
  storage: QueueStorage;
  upload: (item: QueuedPhoto) => Promise<UploadOutcome>;
}) {
  let running: Promise<void> | null = null;
  const listeners = new Set<(items: QueuedPhoto[]) => void>();
  const emit = (items: QueuedPhoto[]) => listeners.forEach((l) => l(items));

  async function add(item: Omit<QueuedPhoto, "attempts">) {
    const items = await deps.storage.load();
    if (!items.some((i) => i.clientId === item.clientId)) items.push({ ...item, attempts: 0 });
    await deps.storage.save(items);
    emit(items);
  }

  /** Uploads everything pending, oldest first. Concurrent calls share one run. */
  function flush(): Promise<void> {
    running ??= (async () => {
      try {
        for (const item of await deps.storage.load()) {
          const outcome = await deps
            .upload(item)
            .catch((e): UploadOutcome => ({ ok: false, retry: true, error: String(e) }));
          const items = await deps.storage.load();
          const i = items.findIndex((x) => x.clientId === item.clientId);
          if (i < 0) continue;
          if (outcome.ok || !outcome.retry || items[i].attempts + 1 >= MAX_ATTEMPTS)
            items.splice(i, 1);
          else
            items[i] = { ...items[i], attempts: items[i].attempts + 1, lastError: outcome.error };
          await deps.storage.save(items);
          emit(items);
          if (!outcome.ok && outcome.retry) break; // probably offline: try again later
        }
      } finally {
        running = null;
      }
    })();
    return running;
  }

  return {
    add,
    flush,
    pending: () => deps.storage.load(),
    subscribe(listener: (items: QueuedPhoto[]) => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
