import { CredentialsSignin } from "next-auth";
import { clientIp, rateLimit, recordFailure } from "@/modules/shared/rate-limit";

/**
 * Sign-in throttles. They live inside the Auth.js providers (authorize / sendVerificationRequest),
 * not in the login pages, because Auth.js also accepts sign-ins directly at /api/auth/*.
 */
const ADMIN_EMAIL = { limit: 10, window: 15 * 60 };
const ADMIN_IP = { limit: 50, window: 60 * 60 };
const OTP_VERIFY_PHONE = { limit: 5, window: 15 * 60 };
const OTP_VERIFY_IP = { limit: 30, window: 60 * 60 };
const MAGIC_EMAIL = { limit: 5, window: 15 * 60 };
const MAGIC_IP = { limit: 30, window: 60 * 60 };

export class RateLimitedSignin extends CredentialsSignin {
  code = "rate_limited";
}

/** Admin password login: only failures count, so busy staff are never locked out. */
export async function adminLoginAllowed(email: string): Promise<boolean> {
  const ip = await clientIp();
  const [byEmail, byIp] = await Promise.all([
    rateLimit("admin-login:email", email, ADMIN_EMAIL.limit, ADMIN_EMAIL.window, new Date(), {
      consume: false,
    }),
    rateLimit("admin-login:ip", ip, ADMIN_IP.limit, ADMIN_IP.window, new Date(), {
      consume: false,
    }),
  ]);
  return byEmail.allowed && byIp.allowed;
}

export async function recordAdminLoginFailure(email: string): Promise<void> {
  const ip = await clientIp();
  await Promise.all([
    recordFailure("admin-login:email", email, ADMIN_EMAIL.window),
    recordFailure("admin-login:ip", ip, ADMIN_IP.window),
  ]);
}

/** Every code check counts: 5 guesses per phone per 15 minutes makes brute force hopeless. */
export async function otpVerifyAllowed(phone: string): Promise<boolean> {
  const [byPhone, byIp] = await Promise.all([
    rateLimit("otp-verify:phone", phone, OTP_VERIFY_PHONE.limit, OTP_VERIFY_PHONE.window),
    rateLimit("otp-verify:ip", await clientIp(), OTP_VERIFY_IP.limit, OTP_VERIFY_IP.window),
  ]);
  return byPhone.allowed && byIp.allowed;
}

export async function magicLinkAllowed(email: string): Promise<boolean> {
  const [byEmail, byIp] = await Promise.all([
    rateLimit("magic:email", email.toLowerCase(), MAGIC_EMAIL.limit, MAGIC_EMAIL.window),
    rateLimit("magic:ip", await clientIp(), MAGIC_IP.limit, MAGIC_IP.window),
  ]);
  return byEmail.allowed && byIp.allowed;
}
