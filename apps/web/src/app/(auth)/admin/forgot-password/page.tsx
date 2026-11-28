import type { Metadata } from "next";
import Link from "next/link";
import { ForgotPasswordForm } from "@/components/auth/password-forms";

export const metadata: Metadata = { title: "Reset your password" };

export default function ForgotPasswordPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Reset your password</h1>
        <p className="text-sm text-muted-foreground">
          Enter your admin email and we&apos;ll send a link to choose a new password.
        </p>
      </div>
      <ForgotPasswordForm />
      <Link href="/admin/login" className="block text-sm text-muted-foreground underline">
        Back to sign in
      </Link>
    </div>
  );
}
