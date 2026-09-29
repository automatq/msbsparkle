import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signIn } from "@/modules/auth/config";
import { clientIp, rateLimit } from "@/modules/shared/rate-limit";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const callbackUrl = typeof params.callbackUrl === "string" ? params.callbackUrl : "/account";
  const error = typeof params.error === "string" ? params.error : null;

  async function sendLink(formData: FormData) {
    "use server";
    const email = String(formData.get("email") ?? "")
      .trim()
      .toLowerCase();
    const [byEmail, byIp] = await Promise.all([
      rateLimit("magic:email", email, 5, 15 * 60),
      rateLimit("magic:ip", await clientIp(), 30, 60 * 60),
    ]);
    if (!byEmail.allowed || !byIp.allowed) redirect("/login?error=RateLimited");
    const provider = process.env.RESEND_API_KEY ? "resend" : "nodemailer";
    await signIn(provider, { email, redirectTo: callbackUrl });
    redirect("/verify");
  }

  return (
    <form action={sendLink} className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Sign in</h1>
        <p className="text-sm text-muted-foreground">We&apos;ll email you a secure sign-in link.</p>
      </div>
      {error ? (
        <p className="text-sm text-destructive">
          {error === "RateLimited"
            ? "Too many sign-in links requested. Try again in a few minutes."
            : "Sign-in failed. Please try again."}
        </p>
      ) : null}
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" required autoComplete="email" />
      </div>
      <Button type="submit" className="w-full">
        Email me a link
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        Cleaner?{" "}
        <Link href="/login/phone" className="underline">
          Sign in with your mobile
        </Link>{" "}
        · Staff?{" "}
        <Link href="/admin/login" className="underline">
          Admin login
        </Link>
      </p>
    </form>
  );
}
