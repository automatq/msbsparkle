import type { NextAuthConfig } from "next-auth";
import type {} from "next-auth/jwt";
import type { RoleClaim } from "./roles";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name?: string | null;
      orgId: string;
      roles: RoleClaim[];
      amr: string[];
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    uid?: string;
    orgId?: string;
    roles?: RoleClaim[];
    amr?: string[];
    sessionVersion?: number;
    rolesRefreshedAt?: number;
  }
}

/**
 * Provider-free config usable from proxy.ts (no Prisma import).
 * The full config in ./config.ts spreads this and adds adapter + providers.
 */
export const edgeAuthConfig = {
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 30 },
  pages: { signIn: "/login", verifyRequest: "/verify", error: "/login" },
  providers: [],
  callbacks: {
    session({ session, token }) {
      session.user.id = token.uid ?? "";
      session.user.orgId = token.orgId ?? "";
      session.user.roles = token.roles ?? [];
      session.user.amr = token.amr ?? [];
      return session;
    },
  },
} satisfies NextAuthConfig;
