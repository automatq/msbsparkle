import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { del, get, put } from "@vercel/blob";

/**
 * Object storage for job photos.
 * - Production (Vercel): private Vercel Blob store, enabled by BLOB_READ_WRITE_TOKEN.
 * - Local dev: files under ./uploads.
 * Either way, objects are only reachable through the authenticated /api/uploads/[...key] route,
 * never by a public URL.
 */
const ROOT = path.join(process.cwd(), "uploads");

export function isBlobConfigured(): boolean {
  return !!process.env.BLOB_READ_WRITE_TOKEN;
}

function assertWritable() {
  if (!isBlobConfigured() && process.env.VERCEL)
    throw new Error("File storage is not configured (BLOB_READ_WRITE_TOKEN missing).");
}

/** Local-disk path for a key, or null if the key would escape the uploads root. */
function localPath(key: string): string | null {
  const full = path.normalize(path.join(ROOT, key));
  return full.startsWith(ROOT + path.sep) ? full : null;
}

export async function putObject(
  prefix: string,
  filename: string,
  data: Buffer,
  contentType: string,
): Promise<{ key: string; url: string }> {
  assertWritable();
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-60);
  const key = `${prefix}/${Date.now()}-${randomBytes(8).toString("hex")}-${safe}`;
  if (isBlobConfigured()) {
    await put(key, data, { access: "private", contentType, addRandomSuffix: false });
  } else {
    const full = localPath(key);
    if (!full) throw new Error("Invalid storage key");
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, data);
  }
  return { key, url: `/api/uploads/${key}` };
}

export async function getObject(
  key: string,
): Promise<{ body: ReadableStream<Uint8Array> | Buffer; contentType: string | null } | null> {
  if (isBlobConfigured()) {
    const res = await get(key, { access: "private" }).catch(() => null);
    if (!res?.stream) return null;
    return { body: res.stream, contentType: res.blob.contentType };
  }
  const full = localPath(key);
  if (!full) return null;
  try {
    return { body: await readFile(full), contentType: null };
  } catch {
    return null;
  }
}

export async function deleteObject(key: string): Promise<void> {
  if (isBlobConfigured()) {
    await del(key).catch(() => {});
    return;
  }
  const full = localPath(key);
  if (full) await unlink(full).catch(() => {});
}
