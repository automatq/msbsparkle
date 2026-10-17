import { jwtVerify, SignJWT } from "jose";
import { env } from "@/modules/shared/env";

const ACCESS_TTL = "15m";
const REFRESH_TTL = "30d";

const accessSecret = new TextEncoder().encode(env.API_JWT_SECRET);
const refreshSecret = new TextEncoder().encode(env.API_JWT_REFRESH_SECRET);

export type ApiTokenClaims = {
  sub: string; // User.id
  orgId: string;
  sessionVersion: number;
};

export class ApiTokenError extends Error {
  constructor(msg = "Invalid or expired token") {
    super(msg);
  }
}

export function signAccessToken(claims: ApiTokenClaims): Promise<string> {
  return new SignJWT({ orgId: claims.orgId, sessionVersion: claims.sessionVersion })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(ACCESS_TTL)
    .sign(accessSecret);
}

export function signRefreshToken(claims: ApiTokenClaims): Promise<string> {
  return new SignJWT({ orgId: claims.orgId, sessionVersion: claims.sessionVersion })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(REFRESH_TTL)
    .sign(refreshSecret);
}

async function verify(token: string, secret: Uint8Array): Promise<ApiTokenClaims> {
  try {
    const { payload } = await jwtVerify(token, secret);
    if (typeof payload.sub !== "string" || typeof payload.orgId !== "string")
      throw new ApiTokenError();
    return {
      sub: payload.sub,
      orgId: payload.orgId,
      sessionVersion: Number(payload.sessionVersion),
    };
  } catch {
    throw new ApiTokenError();
  }
}

export function verifyAccessToken(token: string): Promise<ApiTokenClaims> {
  return verify(token, accessSecret);
}

export function verifyRefreshToken(token: string): Promise<ApiTokenClaims> {
  return verify(token, refreshSecret);
}
