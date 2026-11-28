import type { Metadata } from "next";
import Link from "next/link";
import { SetPasswordForm } from "@/components/auth/password-forms";
import { MIN_PASSWORD_LENGTH, passwordLinkInfo } from "@/modules/auth/admin-users";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Choose your password",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

/** Landing page for an emailed invitation or password-reset link. */
export default async function SetPasswordPage({
  params,
}: PageProps<"/admin/set-password/[token]">) {
  const { token } = await params;
  const info = await passwordLinkInfo(token);
  if (!info)
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold">This link no longer works</h1>
        <p className="text-sm text-muted-foreground">
          It has expired or was already used. Ask for a new one.
        </p>
        <Link href="/admin/forgot-password" className="text-sm font-medium underline">
          Email me a new link
        </Link>
      </div>
    );
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">
          {info.isInvite ? "Welcome. Choose your password" : "Choose a new password"}
        </h1>
        <p className="text-sm text-muted-foreground">For {info.email}</p>
      </div>
      <SetPasswordForm token={token} email={info.email} minLength={MIN_PASSWORD_LENGTH} />
    </div>
  );
}
