import { PrismaAdapter } from "@auth/prisma-adapter";
import NextAuth from "next-auth";
import type { Adapter } from "next-auth/adapters";
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

/**
 * Prisma adapter with org-aware user lookup/creation: our User.email is unique per
 * organization (not globally) and organizationId is required. v1 has a single organization.
 */
function orgAwareAdapter(): Adapter {
  const base = PrismaAdapter(prisma);
  return {
    ...base,
    async getUserByEmail(email) {
      const user = await prisma.user.findFirst({
        where: { email: email.toLowerCase() },
        orderBy: { createdAt: "asc" },
      });
      return user
        ? {
            id: user.id,
            email: user.email,
            emailVerified: user.emailVerified,
            name: user.name,
            image: user.image,
          }
        : null;
    },
    async createUser(data) {
      const org = await prisma.organization.findFirstOrThrow({ select: { id: true } });
      const user = await prisma.user.create({
        data: {
          organizationId: org.id,
          email: data.email.toLowerCase(),
          emailVerified: data.emailVerified ?? null,
          name: data.name ?? null,
          image: data.image ?? null,
          status: "ACTIVE",
        },
      });
      return {
        id: user.id,
        email: user.email,
        emailVerified: user.emailVerified,
        name: user.name,
        image: user.image,
      };
    },
  };
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...edgeAuthConfig,
  adapter: orgAwareAdapter(),
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
      // Email providers call this before the user row exists; only block disabled accounts.
      const email = user.email?.toLowerCase();
      const existing = user.id
        ? await prisma.user.findUnique({ where: { id: user.id }, select: { status: true } })
        : email
          ? await prisma.user.findFirst({ where: { email }, select: { status: true } })
          : null;
      return !existing || existing.status !== "DISABLED";
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
