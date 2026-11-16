import { useState } from "react";
import { KeyboardAvoidingView, Platform, TextInput } from "react-native";
import { ApiRequestError } from "@/api";
import { useAuth } from "@/auth/auth";
import { Button, Screen, T, useColors } from "@/components/ui";

/** Phone number → 6-digit code, like the web portal's /login/phone. */
export default function SignIn() {
  const { requestCode, verifyCode } = useAuth();
  const c = useColors();
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const input = {
    borderColor: c.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    fontSize: 20,
    color: c.text,
  } as const;

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(
        e instanceof ApiRequestError ? e.message : "Can't reach the server. Check your connection.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Screen
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 24, gap: 16, paddingTop: 96 }}
      >
        <T variant="title">Sign in</T>
        {sentTo ? (
          <>
            <T variant="muted">We sent a 6-digit code to {sentTo}.</T>
            <TextInput
              style={[input, { letterSpacing: 8 }]}
              value={code}
              onChangeText={(v) => setCode(v.replace(/\D/g, "").slice(0, 6))}
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              autoComplete="sms-otp"
              autoFocus
              placeholder="000000"
              placeholderTextColor={c.muted}
              accessibilityLabel="6-digit code"
            />
            <Button
              title="Sign in"
              loading={busy}
              disabled={code.length !== 6}
              onPress={() => run(() => verifyCode(phone, code))}
            />
            <Button
              title="Use a different number"
              variant="outline"
              onPress={() => {
                setSentTo(null);
                setCode("");
              }}
            />
          </>
        ) : (
          <>
            <T variant="muted">Enter the mobile number your dispatcher has on file.</T>
            <TextInput
              style={input}
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              textContentType="telephoneNumber"
              autoComplete="tel"
              autoFocus
              placeholder="416 555 1000"
              placeholderTextColor={c.muted}
              accessibilityLabel="Mobile number"
            />
            <Button
              title="Text me a code"
              loading={busy}
              disabled={phone.replace(/\D/g, "").length < 10}
              onPress={() =>
                run(async () => {
                  const r = await requestCode(phone);
                  setSentTo(r.maskedTo);
                })
              }
            />
          </>
        )}
        {error ? <T style={{ color: c.danger }}>{error}</T> : null}
      </Screen>
    </KeyboardAvoidingView>
  );
}
