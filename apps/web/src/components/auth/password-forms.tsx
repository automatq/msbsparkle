"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { forgotPasswordAction, setPasswordAction } from "@/modules/auth/password-actions";

function FormError({ message }: { message: string }) {
  return (
    <p className="text-sm text-destructive" role="alert">
      {message}
    </p>
  );
}

/** Choose a password from an emailed link (invitation or reset). */
export function SetPasswordForm({
  token,
  email,
  minLength,
}: {
  token: string;
  email: string;
  minLength: number;
}) {
  const [state, action, pending] = useActionState(setPasswordAction.bind(null, token), null);

  if (state?.ok)
    return (
      <div className="space-y-4" data-testid="password-set">
        <p className="text-sm">Your password is set. Sign in with {email}.</p>
        <Link
          href="/admin/login"
          className="inline-flex h-9 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
        >
          Go to sign in
        </Link>
      </div>
    );

  return (
    <form className="space-y-4" action={action}>
      {/* Lets password managers attach the new password to the right account. */}
      <input type="email" name="email" value={email} autoComplete="username" readOnly hidden />
      <div className="space-y-2">
        <Label htmlFor="new-password">New password</Label>
        <Input
          id="new-password"
          name="password"
          type="password"
          autoComplete="new-password"
          aria-describedby="password-hint"
          required
        />
        <p id="password-hint" className="text-xs text-muted-foreground">
          At least {minLength} characters. A few unrelated words work well.
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="new-password-again">Repeat password</Label>
        <Input
          id="new-password-again"
          name="again"
          type="password"
          autoComplete="new-password"
          required
        />
      </div>
      {state && !state.ok ? <FormError message={state.message} /> : null}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Saving…" : "Set password"}
      </Button>
    </form>
  );
}

/** Ask for a reset link. The answer is the same whether or not the address is an admin's. */
export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(forgotPasswordAction, null);

  if (state?.ok)
    return (
      <p className="text-sm" data-testid="reset-requested">
        If {state.email} belongs to an admin account, a reset link is on its way. It works for one
        hour.
      </p>
    );

  return (
    <form className="space-y-4" action={action}>
      <div className="space-y-2">
        <Label htmlFor="reset-email">Email</Label>
        <Input id="reset-email" name="email" type="email" autoComplete="username" required />
      </div>
      {state && !state.ok ? <FormError message={state.message} /> : null}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Sending…" : "Email me a reset link"}
      </Button>
    </form>
  );
}
