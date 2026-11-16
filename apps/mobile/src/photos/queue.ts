/**
 * React Native side of the photo queue: resize, persist, upload through the API client.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { useEffect, useState } from "react";
import type { PhotoKind, PhotoResult } from "@msb/shared/mobile-api";
import { api, ApiRequestError } from "@/api";
import { createPhotoQueue, type QueuedPhoto } from "./queue-core";

const KEY = "msb.photos.queue";
/** Same as the web portal: longest edge 2000 px, JPEG 0.82, which also drops EXIF/GPS. */
const MAX_EDGE = 2000;
const QUALITY = 0.82;

export const photoQueue = createPhotoQueue({
  storage: {
    async load() {
      const raw = await AsyncStorage.getItem(KEY);
      return raw ? (JSON.parse(raw) as QueuedPhoto[]) : [];
    },
    async save(items) {
      await AsyncStorage.setItem(KEY, JSON.stringify(items));
    },
  },
  async upload(item) {
    const form = new FormData();
    form.append("kind", item.kind);
    form.append("clientId", item.clientId);
    // React Native's FormData takes a file descriptor object for local files.
    form.append("file", {
      uri: item.uri,
      name: `${item.kind.toLowerCase()}.jpg`,
      type: "image/jpeg",
    } as unknown as Blob);
    try {
      await api.request<PhotoResult>(`jobs/${item.jobId}/photos`, { form });
      return { ok: true };
    } catch (e) {
      if (e instanceof ApiRequestError) {
        const retry = e.status >= 500 || e.status === 429 || e.status === 401;
        return { ok: false, retry, error: e.message };
      }
      return { ok: false, retry: true, error: String(e) };
    }
  },
});

/** Resizes a camera/library photo and queues it for upload. */
export async function addPhoto(
  jobId: string,
  kind: PhotoKind,
  photo: { uri: string; width: number; height: number },
) {
  const longest = Math.max(photo.width, photo.height);
  const ctx = ImageManipulator.manipulate(photo.uri);
  if (longest > MAX_EDGE)
    ctx.resize(photo.width >= photo.height ? { width: MAX_EDGE } : { height: MAX_EDGE });
  const image = await ctx.renderAsync();
  const saved = await image.saveAsync({ compress: QUALITY, format: SaveFormat.JPEG });
  await photoQueue.add({ clientId: Crypto.randomUUID(), jobId, kind, uri: saved.uri });
  void photoQueue.flush();
}

/** Photos for a job still waiting to upload. */
export function usePendingPhotos(jobId: string) {
  const [items, setItems] = useState<QueuedPhoto[]>([]);
  useEffect(() => {
    void photoQueue.pending().then(setItems);
    return photoQueue.subscribe(setItems);
  }, []);
  return items.filter((i) => i.jobId === jobId);
}
