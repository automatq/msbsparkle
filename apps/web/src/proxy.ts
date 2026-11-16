import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { edgeAuthConfig } from "@/modules/auth/edge-config";
import { hasRole } from "@/modules/auth/roles";

const { auth } = NextAuth(edgeAuthConfig);

/**
 * Coarse, UX-only gatekeeping. Authoritative checks live in layouts, Server
 * Actions and Route Handlers via getCtx()/requireRole().
 */
export const proxy = auth((req) => {
  const { pathname } = req.nextUrl;
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
  matcher: ["/admin/:path*", "/cleaner/:path*", "/account/:path*"],
};
