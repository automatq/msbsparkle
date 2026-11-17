"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCtx } from "@/modules/auth/session";
import {
  WebhookInputError,
  createEndpoint,
  deleteEndpoint,
  resendDelivery,
  rotateEndpointSecret,
  sendTestEvent,
  setEndpointEnabled,
  updateEndpoint,
  type EndpointInput,
} from "./manage";

type Result<T = object> = ({ ok: true } & T) | { ok: false; message: string };
const PATH = "/admin/settings/webhooks";

function fail(e: unknown): { ok: false; message: string } {
  if (e instanceof WebhookInputError) return { ok: false, message: e.message };
  if (e instanceof z.ZodError) return { ok: false, message: "Please check the form." };
  if (e instanceof Error && /Unauthorized|Forbidden/.test(e.message))
    return { ok: false, message: e.message };
  console.error(e);
  return { ok: false, message: "Something went wrong" };
}

// Endpoints receive every customer's details, so only super admins manage them.
const admin = () => getCtx("SUPER_ADMIN");

export async function createEndpointAction(
  input: EndpointInput,
): Promise<Result<{ secret: string }>> {
  try {
    const ctx = await admin();
    const { secret } = await createEndpoint(ctx.orgId, input);
    revalidatePath(PATH);
    return { ok: true, secret };
  } catch (e) {
    return fail(e);
  }
}

export async function updateEndpointAction(id: string, input: EndpointInput): Promise<Result> {
  try {
    const ctx = await admin();
    await updateEndpoint(ctx.orgId, id, input);
    revalidatePath(PATH);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function setEndpointEnabledAction(id: string, enabled: boolean): Promise<Result> {
  try {
    const ctx = await admin();
    await setEndpointEnabled(ctx.orgId, id, enabled);
    revalidatePath(PATH);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function rotateSecretAction(id: string): Promise<Result<{ secret: string }>> {
  try {
    const ctx = await admin();
    const secret = await rotateEndpointSecret(ctx.orgId, id);
    return { ok: true, secret };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteEndpointAction(id: string): Promise<Result> {
  try {
    const ctx = await admin();
    await deleteEndpoint(ctx.orgId, id);
    revalidatePath(PATH);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

type SendOutcome = Result<{ delivered: boolean; status: number | null; error: string | null }>;

export async function sendTestEventAction(id: string): Promise<SendOutcome> {
  try {
    const ctx = await admin();
    const r = await sendTestEvent(ctx.orgId, id);
    revalidatePath(PATH);
    return { ok: true, delivered: r.ok, status: r.status, error: r.error };
  } catch (e) {
    return fail(e);
  }
}

export async function resendDeliveryAction(deliveryId: string): Promise<SendOutcome> {
  try {
    const ctx = await admin();
    const r = await resendDelivery(ctx.orgId, deliveryId);
    revalidatePath(PATH);
    return { ok: true, delivered: r.ok, status: r.status, error: r.error };
  } catch (e) {
    return fail(e);
  }
}
