import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { generateSecret, generateURI, verifySync } from "otplib";

function key(): Buffer {
  const raw = process.env.AUTH_ENCRYPTION_KEY ?? "";
  const buf = Buffer.from(raw, "base64");
  if (buf.length !== 32) {
    throw new Error("AUTH_ENCRYPTION_KEY must be 32 bytes, base64 encoded");
  }
  return buf;
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, enc].map((b) => b.toString("base64")).join(".");
}

export function decryptSecret(payload: string): string {
  const [iv, tag, enc] = payload.split(".").map((s) => Buffer.from(s, "base64"));
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}

export function generateTotpSecret(): string {
  return generateSecret();
}

export function totpUri(secret: string, email: string, issuer: string): string {
  return generateURI({ issuer, label: email, secret });
}

export function verifyTotp(secret: string, code: string): boolean {
  try {
    return verifySync({ secret, token: code.replace(/\s/g, ""), epochTolerance: 1 }).valid;
  } catch {
    return false;
  }
}
