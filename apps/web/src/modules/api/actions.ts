"use server";

import { revalidatePath } from "next/cache";
import { getCtx } from "@/modules/auth/session";
import { ApiKeyError, createApiKey, revokeApiKey } from "./keys";

type Result<T = object> = ({ ok: true } & T) | { ok: false; message: string };
const PATH = "/admin/settings/api-keys";

function fail(e: unknown): { ok: false; message: string } {
  if (e instanceof ApiKeyError) return { ok: false, message: e.message };
  if (e instanceof Error && /Unauthorized|Forbidden/.test(e.message))
    return { ok: false, message: e.message };
  console.error(e);
  return { ok: false, message: "Something went wrong" };
}

// Keys read every customer's details, so only super admins manage them.
export async function createApiKeyAction(name: string): Promise<Result<{ key: string }>> {
  try {
    const ctx = await getCtx("SUPER_ADMIN");
    const { key } = await createApiKey(ctx.orgId, name, ctx.userId);
    revalidatePath(PATH);
    return { ok: true, key };
  } catch (e) {
    return fail(e);
  }
}

export async function revokeApiKeyAction(id: string): Promise<Result> {
  try {
    const ctx = await getCtx("SUPER_ADMIN");
    await revokeApiKey(ctx.orgId, id);
    revalidatePath(PATH);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
