import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signIn } from "@/modules/auth/config";
import { clientIp, rateLimit, recordFailure } from "@/modules/shared/rate-limit";

export default async function AdminLoginPage({ searchParams }: PageProps<"/admin/login">) {
  const params = await searchParams;
  const callbackUrl = typeof params.callbackUrl === "string" ? params.callbackUrl : "/admin";
  const error = typeof params.error === "string" ? params.error : null;

  async function login(formData: FormData) {
    "use server";
    const emailKey = String(formData.get("email") ?? "")
      .trim()
      .toLowerCase();
    // Only failed attempts count, so a busy dispatcher is never locked out by successful logins.
    const ip = await clientIp();
    const [byEmail, byIp] = await Promise.all([
      rateLimit("admin-login:email", emailKey, 10, 15 * 60, new Date(), { consume: false }),
      rateLimit("admin-login:ip", ip, 50, 60 * 60, new Date(), { consume: false }),
    ]);
    if (!byEmail.allowed || !byIp.allowed) redirect(`/admin/login?error=RateLimited`);
    try {
      await signIn("admin-credentials", {
        email: String(formData.get("email") ?? "")
          .trim()
          .toLowerCase(),
        password: String(formData.get("password") ?? ""),
        totp: String(formData.get("totp") ?? ""),
        redirectTo: callbackUrl,
      });
    } catch (e) {
      if (e instanceof AuthError) {
        await recordFailure("admin-login:email", emailKey, 15 * 60);
        await recordFailure("admin-login:ip", ip, 60 * 60);
        redirect(`/admin/login?error=CredentialsSignin`);
      }
      throw e;
    }
  }

  return (
    <form action={login} className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Admin sign in</h1>
        <p className="text-sm text-muted-foreground">Staff and dispatch access.</p>
      </div>
      {error ? (
        <p className="text-sm text-destructive">
          {error === "RateLimited"
            ? "Too many attempts. Try again in a few minutes."
            : "Invalid email, password or code."}
        </p>
      ) : null}
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" required autoComplete="username" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="totp">Authenticator code (if enabled)</Label>
        <Input id="totp" name="totp" inputMode="numeric" autoComplete="one-time-code" />
      </div>
      <Button type="submit" className="w-full">
        Sign in
      </Button>
    </form>
  );
}
