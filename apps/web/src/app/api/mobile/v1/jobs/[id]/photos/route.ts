import { photoFields } from "@msb/shared/mobile-api";
import { MAX_PHOTO_BYTES, addPhoto } from "@/modules/cleaner/service";
import { apiError, cleanerRoute, fromResult } from "@/modules/mobile-api/http";

export const runtime = "nodejs";

/**
 * multipart/form-data with `file`, `kind` (BEFORE | AFTER | ISSUE) and an optional `clientId`.
 * Resending the same clientId returns the photo already stored. Resize on the device first:
 * request bodies are capped at 4.5 MB on Vercel.
 */
export const POST = cleanerRoute<{ id: string }>(async ({ req, actor, params }) => {
  const form = await req.formData().catch(() => null);
  if (!form) return apiError("INVALID", "Send the photo as multipart/form-data.");
  const fields = photoFields.safeParse({
    kind: form.get("kind"),
    clientId: form.get("clientId") ?? undefined,
  });
  if (!fields.success)
    return apiError("INVALID", fields.error.issues[0]?.message ?? "Invalid fields", {
      issues: fields.error.issues,
    });
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return apiError("INVALID", "Choose a photo.");
  if (file.size > MAX_PHOTO_BYTES) return apiError("INVALID", "Photo is too large (4 MB max).");
  return fromResult(
    await addPhoto(actor, params.id, {
      kind: fields.data.kind,
      clientId: fields.data.clientId,
      bytes: Buffer.from(await file.arrayBuffer()),
      filename: file.name,
    }),
  );
});
