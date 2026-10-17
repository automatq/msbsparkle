import { createHash } from "node:crypto";
import { prisma } from "@/modules/db/client";

export class ApiKeyError extends Error {
  constructor(msg = "Missing or invalid API key") {
    super(msg);
  }
}

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/** Resolves the tenant for a /api/v1/* request from its X-Api-Key header. */
export async function resolveOrgFromApiKey(
  req: Request,
): Promise<{ organizationId: string; allowedOrigin: string | null }> {
  const key = req.headers.get("x-api-key");
  if (!key) throw new ApiKeyError();
  const org = await prisma.organization.findUnique({
    where: { apiKeyHash: hashApiKey(key) },
    select: { id: true, allowedOrigin: true },
  });
  if (!org) throw new ApiKeyError();
  return { organizationId: org.id, allowedOrigin: org.allowedOrigin };
}
