import { PrismaAdapter } from "@auth/prisma-adapter";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Nodemailer from "next-auth/providers/nodemailer";
import Resend from "next-auth/providers/resend";
import { z } from "zod";
import { prisma } from "@/modules/db/client";
import { edgeAuthConfig } from "./edge-config";
import { verifyOtp } from "./otp";
import { verifyPassword } from "./password";
import type { RoleClaim } from "./roles";
import { decryptSecret, verifyTotp } from "./totp";

const ROLES_TTL_MS = 15 * 60 * 1000;

const adminCredentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  totp: z.string().optional(),
});

async function loadRoles(
  userId: string,
): Promise<{ roles: RoleClaim[]; sessionVersion: number; orgId: string } | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      organizationId: true,
      sessionVersion: true,
      status: true,
      roles: { select: { role: true, regionId: true } },
    },
  });
  if (!user || user.status === "DISABLED") return null;
  return {
    orgId: user.organizationId,
    sessionVersion: user.sessionVersion,
    roles: user.roles.map((r) => ({ role: r.role, regionId: r.regionId })),
  };
}

function emailProvider() {
  if (process.env.RESEND_API_KEY) {
    return Resend({ apiKey: process.env.RESEND_API_KEY, from: process.env.EMAIL_FROM });
  }
  return Nodemailer({
    server: {
      host: process.env.SMTP_HOST ?? "localhost",
      port: Number(process.env.SMTP_PORT ?? 1025),
      secure: false,
    },
    from: process.env.EMAIL_FROM,
  });
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...edgeAuthConfig,
  adapter: PrismaAdapter(prisma),
  providers: [
    emailProvider(),
    Credentials({
      id: "phone-otp",
      name: "Mobile code",
      credentials: {
        phone: { label: "Mobile", type: "tel" },
        code: { label: "Code", type: "text" },
      },
      async authorize(raw) {
        const phone = typeof raw?.phone === "string" ? raw.phone : "";
        const code = typeof raw?.code === "string" ? raw.code : "";
        const userId = await verifyOtp(phone, code);
        if (!userId) return null;
        const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
        return { id: user.id, email: user.email, name: user.name, amr: ["otp"] } as never;
      },
    }),
    Credentials({
      id: "admin-credentials",
      name: "Admin login",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        totp: { label: "Authenticator code", type: "text" },
      },
      async authorize(raw) {
        const parsed = adminCredentialsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const { email, password, totp } = parsed.data;
        const user = await prisma.user.findFirst({
          where: {
            email: email.toLowerCase(),
            status: "ACTIVE",
            roles: { some: { role: { in: ["SUPER_ADMIN", "REGION_ADMIN"] } } },
          },
          select: {
            id: true,
            email: true,
            name: true,
            passwordHash: true,
            totpEnabled: true,
            totpSecret: true,
          },
        });
        if (!user?.passwordHash) return null;
        if (!(await verifyPassword(user.passwordHash, password))) return null;
        if (user.totpEnabled) {
          if (!totp || !user.totpSecret) return null;
          if (!verifyTotp(decryptSecret(user.totpSecret), totp)) return null;
        }
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          amr: user.totpEnabled ? ["pwd", "totp"] : ["pwd"],
        } as never;
      },
    }),
  ],
  callbacks: {
    ...edgeAuthConfig.callbacks,
    async signIn({ user }) {
      if (!user.id) return false;
      const u = await prisma.user.findUnique({ where: { id: user.id }, select: { status: true } });
      return !!u && u.status !== "DISABLED";
    },
    async jwt({ token, user, trigger }) {
      const now = Date.now();
      if (user?.id) {
        token.uid = user.id;
        token.amr = (user as { amr?: string[] }).amr ?? ["email"];
      }
      const stale = !token.rolesRefreshedAt || now - token.rolesRefreshedAt > ROLES_TTL_MS;
      if (token.uid && (user || trigger === "update" || stale)) {
        const loaded = await loadRoles(token.uid);
        if (!loaded) return null;
        if (token.sessionVersion !== undefined && token.sessionVersion !== loaded.sessionVersion)
          return null;
        token.orgId = loaded.orgId;
        token.roles = loaded.roles;
        token.sessionVersion = loaded.sessionVersion;
        token.rolesRefreshedAt = now;
      }
      return token;
    },
  },
  events: {
    async createUser({ user }) {
      // Magic-link sign-ups become customers by default.
      if (!user.id) return;
      const existing = await prisma.userRole.count({ where: { userId: user.id } });
      if (existing === 0) {
        await prisma.userRole.create({ data: { userId: user.id, role: "CUSTOMER" } });
      }
    },
  },
});
