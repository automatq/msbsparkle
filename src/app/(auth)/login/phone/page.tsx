import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signIn } from "@/modules/auth/config";
import { requestOtp } from "@/modules/auth/otp";

export default async function PhoneLoginPage({ searchParams }: PageProps<"/login/phone">) {
  const params = await searchParams;
  const phone = typeof params.phone === "string" ? params.phone : "";
  const sent = typeof params.sent === "string" ? params.sent : "";
  const error = typeof params.error === "string" ? params.error : "";
  const callbackUrl = typeof params.callbackUrl === "string" ? params.callbackUrl : "/cleaner";

  async function sendCode(formData: FormData) {
    "use server";
    const p = String(formData.get("phone") ?? "").trim();
    const res = await requestOtp(p);
    if (!res.ok) redirect(`/login/phone?error=${encodeURIComponent(res.message)}`);
    redirect(
      `/login/phone?phone=${encodeURIComponent(p)}&sent=${res.channel}:${encodeURIComponent(res.maskedTo)}`,
    );
  }

  async function verify(formData: FormData) {
    "use server";
    const p = String(formData.get("phone") ?? "");
    try {
      await signIn("phone-otp", {
        phone: p,
        code: String(formData.get("code") ?? ""),
        redirectTo: callbackUrl,
      });
    } catch (e) {
      if (e instanceof AuthError)
        redirect(
          `/login/phone?phone=${encodeURIComponent(p)}&sent=retry&error=${encodeURIComponent("That code didn't work. Request a new one.")}`,
        );
      throw e;
    }
  }

  if (!phone) {
    return (
      <form action={sendCode} className="space-y-4">
        <div>
          <h1 className="text-xl font-semibold">Cleaner sign in</h1>
          <p className="text-sm text-muted-foreground">
            We&apos;ll text a 6-digit code to your mobile.
          </p>
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <div className="space-y-2">
          <Label htmlFor="phone">Mobile number</Label>
          <Input
            id="phone"
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="416 555 0123"
            required
            autoFocus
          />
        </div>
        <Button type="submit" className="w-full">
          Text me a code
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          <a href="/login" className="underline">
            Customer? Sign in with email
          </a>
        </p>
      </form>
    );
  }
  const [channel, maskedTo] = sent.split(":");
  return (
    <form action={verify} className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Enter your code</h1>
        <p className="text-sm text-muted-foreground">
          {channel === "email"
            ? `Sent by email to ${decodeURIComponent(maskedTo ?? "")} (SMS not configured).`
            : channel === "sms"
              ? `Sent to ${decodeURIComponent(maskedTo ?? "")}.`
              : "Enter the code we sent you."}
        </p>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <input type="hidden" name="phone" value={phone} />
      <div className="space-y-2">
        <Label htmlFor="code">6-digit code</Label>
        <Input
          id="code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          maxLength={6}
          required
          autoFocus
          className="text-center text-2xl tracking-[0.5em]"
        />
      </div>
      <Button type="submit" className="w-full">
        Sign in
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        <a href="/login/phone" className="underline">
          Use a different number
        </a>
      </p>
    </form>
  );
}
