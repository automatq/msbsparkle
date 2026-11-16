"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  confirmTotpEnrolmentAction,
  disableTotpAction,
  startTotpEnrolmentAction,
} from "@/modules/auth/totp-actions";

export function TotpSetup({ enabled }: { enabled: boolean }) {
  const [qr, setQr] = useState<{ qrDataUrl: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const run = (fn: () => Promise<{ ok: boolean; message?: string }>) =>
    start(async () => {
      const r = await fn();
      if (r.ok) {
        toast.success(r.message ?? "Done");
        setQr(null);
        setCode("");
        router.refresh();
      } else toast.error(r.message ?? "Failed");
    });
  if (enabled) {
    return (
      <div className="space-y-3 text-sm">
        <p className="rounded-lg bg-emerald-50 p-3 text-emerald-900" data-testid="totp-on">
          Two-factor authentication is on for your account.
        </p>
        <div className="flex items-center gap-2">
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Current code"
            inputMode="numeric"
            className="w-40"
          />
          <Button
            variant="outline"
            size="sm"
            disabled={pending || code.length < 6}
            onClick={() => run(() => disableTotpAction(code))}
          >
            Turn off
          </Button>
        </div>
      </div>
    );
  }
  if (!qr) {
    return (
      <div className="space-y-3 text-sm">
        <p className="text-muted-foreground">
          Protect admin access with a code from an authenticator app (1Password, Google
          Authenticator, Authy).
        </p>
        <Button
          size="sm"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await startTotpEnrolmentAction();
              if (r.ok) setQr({ qrDataUrl: r.qrDataUrl, secret: r.secret });
              else toast.error(r.message);
            })
          }
          data-testid="totp-start"
        >
          Set up two-factor
        </Button>
      </div>
    );
  }
  return (
    <div className="space-y-3 text-sm">
      <p>Scan this with your authenticator app, then enter the 6-digit code it shows.</p>
      <Image
        src={qr.qrDataUrl}
        alt="Authenticator QR code"
        width={200}
        height={200}
        unoptimized
        className="rounded-lg border"
      />
      <p className="text-xs text-muted-foreground">
        Can&apos;t scan? Enter this key manually:{" "}
        <span className="font-mono" data-testid="totp-secret">
          {qr.secret}
        </span>
      </p>
      <div className="flex items-center gap-2">
        <Input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="123456"
          inputMode="numeric"
          maxLength={6}
          className="w-40"
          data-testid="totp-code"
        />
        <Button
          size="sm"
          disabled={pending || code.length < 6}
          onClick={() => run(() => confirmTotpEnrolmentAction(code))}
          data-testid="totp-confirm"
        >
          Confirm
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setQr(null)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
