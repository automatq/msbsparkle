import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";

/**
 * Dev/self-hosted storage: files under ./uploads, served by /api/uploads/[...key].
 * Swap for UploadThing/S3 by implementing the same two functions.
 */
const ROOT = path.join(process.cwd(), "uploads");

export async function putObject(
  prefix: string,
  filename: string,
  data: Buffer,
): Promise<{ key: string; url: string }> {
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-60);
  const key = `${prefix}/${Date.now()}-${randomBytes(4).toString("hex")}-${safe}`;
  const full = path.join(ROOT, key);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, data);
  return { key, url: `/api/uploads/${key}` };
}

export async function getObject(key: string): Promise<Buffer | null> {
  const full = path.normalize(path.join(ROOT, key));
  if (!full.startsWith(ROOT)) return null;
  try {
    return await readFile(full);
  } catch {
    return null;
  }
}
