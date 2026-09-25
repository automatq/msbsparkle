import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signIn } from "@/modules/auth/config";

export default async function AdminLoginPage({ searchParams }: PageProps<"/admin/login">) {
  const params = await searchParams;
  const callbackUrl = typeof params.callbackUrl === "string" ? params.callbackUrl : "/admin";
  const error = typeof params.error === "string" ? params.error : null;

  async function login(formData: FormData) {
    "use server";
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
      if (e instanceof AuthError) redirect(`/admin/login?error=CredentialsSignin`);
      throw e;
    }
  }

  return (
    <form action={login} className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Admin sign in</h1>
        <p className="text-sm text-muted-foreground">Staff and dispatch access.</p>
      </div>
      {error ? <p className="text-sm text-destructive">Invalid email, password or code.</p> : null}
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
