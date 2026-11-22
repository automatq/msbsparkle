"use client";

import { Alert, Button, Group, Image, Stack, Text, TextInput } from "@mantine/core";
import { ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  confirmTotpEnrolmentAction,
  disableTotpAction,
  startTotpEnrolmentAction,
} from "@/modules/auth/totp-actions";

/** Enrol in, or turn off, two-factor sign-in with an authenticator app. */
export function TotpSetup({ enabled }: { enabled: boolean }) {
  const [qr, setQr] = useState<{ qrDataUrl: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const digits = (v: string) => v.replace(/\D/g, "").slice(0, 6);
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

  if (enabled)
    return (
      <Stack gap="sm">
        <Alert color="teal" icon={<ShieldCheck size={18} />} data-testid="totp-on">
          Two-factor authentication is on for your account.
        </Alert>
        <Group align="flex-end" gap="xs">
          <TextInput
            label="To turn it off, enter a current code"
            placeholder="Current code"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => setCode(digits(e.currentTarget.value))}
            w={220}
          />
          <Button
            variant="default"
            color="red"
            loading={pending}
            disabled={code.length < 6}
            onClick={() => run(() => disableTotpAction(code))}
          >
            Turn off
          </Button>
        </Group>
      </Stack>
    );

  if (!qr)
    return (
      <Stack gap="sm" align="flex-start">
        <Text size="sm" c="dimmed">
          Protect admin access with a code from an authenticator app (1Password, Google
          Authenticator, Authy). After this, signing in needs your password and a code.
        </Text>
        <Button
          loading={pending}
          data-testid="totp-start"
          onClick={() =>
            start(async () => {
              const r = await startTotpEnrolmentAction();
              if (r.ok) setQr({ qrDataUrl: r.qrDataUrl, secret: r.secret });
              else toast.error(r.message);
            })
          }
        >
          Set up two-factor
        </Button>
      </Stack>
    );

  return (
    <Stack gap="sm">
      <Text size="sm">
        Scan this with your authenticator app, then enter the 6-digit code it shows.
      </Text>
      {/* QR codes need a light background to scan, in either color scheme. */}
      <Image
        src={qr.qrDataUrl}
        alt="Authenticator QR code"
        w={200}
        h={200}
        radius="md"
        bg="white"
        p={8}
        style={{ border: "1px solid var(--mantine-color-default-border)" }}
      />
      <Text size="xs" c="dimmed">
        Can&apos;t scan? Enter this key manually:{" "}
        <Text span ff="monospace" c="var(--mantine-color-text)" data-testid="totp-secret">
          {qr.secret}
        </Text>
      </Text>
      <Group align="flex-end" gap="xs">
        <TextInput
          label="Code"
          placeholder="123456"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(digits(e.currentTarget.value))}
          w={160}
          data-testid="totp-code"
        />
        <Button
          loading={pending}
          disabled={code.length < 6}
          onClick={() => run(() => confirmTotpEnrolmentAction(code))}
          data-testid="totp-confirm"
        >
          Confirm
        </Button>
        <Button variant="subtle" color="gray" onClick={() => setQr(null)}>
          Cancel
        </Button>
      </Group>
    </Stack>
  );
}
