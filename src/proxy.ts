import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { edgeAuthConfig } from "@/modules/auth/edge-config";
import { hasRole } from "@/modules/auth/roles";
import { prisma } from "@/modules/db/client";

const { auth } = NextAuth(edgeAuthConfig);

const API_V1_CORS_HEADERS = {
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Api-Key",
};

/**
 * CORS for the public, cross-origin /api/v1/* surface. Allowed origins are
 * per-tenant (Organization.allowedOrigin), not a fixed allow-list, since each
 * client gets its own frontend origin. This is a browser-side convenience
 * only — real auth is the X-Api-Key header + bearer token on the request
 * itself, checked in the route handlers.
 */
async function handleApiV1Cors(req: Request): Promise<NextResponse> {
  const origin = req.headers.get("origin");
  const isAllowed =
    !!origin && !!(await prisma.organization.findFirst({ where: { allowedOrigin: origin } }));

  if (req.method === "OPTIONS") {
    return new NextResponse(null, {
      status: 204,
      headers: {
        ...API_V1_CORS_HEADERS,
        ...(isAllowed && origin ? { "Access-Control-Allow-Origin": origin } : {}),
      },
    });
  }
  const res = NextResponse.next();
  for (const [k, v] of Object.entries(API_V1_CORS_HEADERS)) res.headers.set(k, v);
  if (isAllowed && origin) res.headers.set("Access-Control-Allow-Origin", origin);
  return res;
}

/**
 * Coarse, UX-only gatekeeping. Authoritative checks live in layouts, Server
 * Actions and Route Handlers via getCtx()/requireRole().
 */
export const proxy = auth((req) => {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/api/v1")) return handleApiV1Cors(req);

  const roles = req.auth?.user?.roles ?? [];
  const signedIn = !!req.auth?.user?.id;

  const redirectTo = (path: string) => {
    const url = new URL(path, req.nextUrl.origin);
    if (!signedIn) url.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(url);
  };

  if (pathname.startsWith("/admin")) {
    if (pathname === "/admin/login") return NextResponse.next();
    if (!signedIn) return redirectTo("/admin/login");
    if (!hasRole(roles, "SUPER_ADMIN", "REGION_ADMIN")) return redirectTo("/");
  }
  if (pathname.startsWith("/cleaner")) {
    if (!signedIn) return redirectTo("/login/phone");
    if (!hasRole(roles, "CLEANER", "SUPER_ADMIN")) return redirectTo("/");
  }
  if (pathname.startsWith("/account")) {
    if (!signedIn) return redirectTo("/login");
  }
  return NextResponse.next();
});

export const config = {
  matcher: ["/admin/:path*", "/cleaner/:path*", "/account/:path*", "/api/v1/:path*"],
};
