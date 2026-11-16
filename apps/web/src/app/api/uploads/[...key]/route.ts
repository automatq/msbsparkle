import type { NextRequest } from "next/server";
import { getMobileAuth } from "@/modules/auth/mobile";
import { getOptionalCtx } from "@/modules/auth/session";
import { hasRole } from "@/modules/auth/roles";
import { prisma } from "@/modules/db/client";
import { getObject } from "@/modules/storage";

export const runtime = "nodejs";

const NOT_FOUND = () => new Response("Not found", { status: 404 });

/**
 * Serves stored job photos to people allowed to see the job: admins with access to its region,
 * cleaners who accepted it, and the customer who owns it. Everyone else (including cleaners who
 * were only offered the job, declined it or were removed) gets a 404.
 */
export async function GET(req: NextRequest, ctx: RouteContext<"/api/uploads/[...key]">) {
  const { key: parts } = await ctx.params;
  const key = parts.map(decodeURIComponent).join("/");
  // Browser sessions use the Auth.js cookie; the mobile app sends its bearer token.
  const session = (await getOptionalCtx()) ?? (await getMobileAuth(req))?.ctx ?? null;
  if (!session) return new Response("Unauthorized", { status: 401 });

  const photo = await prisma.jobPhoto.findFirst({
    where: { storageKey: key },
    select: {
      job: {
        select: {
          organizationId: true,
          regionId: true,
          customer: { select: { userId: true } },
          assignments: {
            where: { status: "ACCEPTED" },
            select: { cleaner: { select: { userId: true } } },
          },
        },
      },
    },
  });
  if (!photo || photo.job.organizationId !== session.orgId) return NOT_FOUND();

  const { job } = photo;
  const isAdmin =
    hasRole(session.roles, "SUPER_ADMIN", "REGION_ADMIN") &&
    (session.isSuperAdmin || session.regionIds.includes(job.regionId));
  const isAssignedCleaner = job.assignments.some((a) => a.cleaner.userId === session.userId);
  const isOwner = job.customer.userId === session.userId;
  if (!isAdmin && !isAssignedCleaner && !isOwner) return NOT_FOUND();

  const obj = await getObject(key);
  if (!obj) return NOT_FOUND();
  const body = Buffer.isBuffer(obj.body) ? new Uint8Array(obj.body) : obj.body;
  return new Response(body, {
    headers: {
      // Only raster images are ever stored; never let the browser sniff anything else.
      "Content-Type": safeImageType(obj.contentType, key),
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Cache-Control": "private, max-age=3600",
    },
  });
}

function safeImageType(contentType: string | null, key: string): string {
  const allowed = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
  if (contentType && allowed.includes(contentType)) return contentType;
  if (/\.png$/i.test(key)) return "image/png";
  if (/\.webp$/i.test(key)) return "image/webp";
  return "image/jpeg";
}
