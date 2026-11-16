import { useQueryClient } from "@tanstack/react-query";
import * as Application from "expo-application";
import * as Device from "expo-device";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Platform } from "react-native";
import type { OtpRequestResult, TokenPair } from "@msb/shared/mobile-api";
import { api, onSessionEnded } from "@/api";
import { unregisterPush } from "@/push/push";
import { stopTracking } from "@/tracking/location";
import { secureTokenStore } from "./token-store";

type Status = "loading" | "signedOut" | "signedIn";

type AuthContextValue = {
  status: Status;
  requestCode(phone: string): Promise<OtpRequestResult>;
  verifyCode(phone: string, code: string): Promise<void>;
  signOut(): Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<Status>("loading");
  const queryClient = useQueryClient();

  useEffect(() => {
    secureTokenStore.get().then((t) => setStatus(t ? "signedIn" : "signedOut"));
    return onSessionEnded(() => {
      queryClient.clear();
      setStatus("signedOut");
    });
  }, [queryClient]);

  const requestCode = useCallback(async (phone: string) => {
    const r = await api.request<OtpRequestResult>("auth/otp/request", {
      body: { phone },
      anonymous: true,
    });
    return r.data;
  }, []);

  const verifyCode = useCallback(async (phone: string, code: string) => {
    const r = await api.request<TokenPair>("auth/otp/verify", {
      anonymous: true,
      body: {
        phone,
        code,
        device: {
          name: Device.deviceName ?? Device.modelName ?? "Phone",
          platform: Platform.OS === "ios" || Platform.OS === "android" ? Platform.OS : "other",
          appVersion: Application.nativeApplicationVersion ?? undefined,
        },
      },
    });
    await secureTokenStore.set(r.data);
    setStatus("signedIn");
  }, []);

  const signOut = useCallback(async () => {
    await stopTracking().catch(() => {});
    await unregisterPush().catch(() => {});
    await api.request("auth/logout", { body: {} }).catch(() => {});
    await secureTokenStore.set(null);
    queryClient.clear();
    setStatus("signedOut");
  }, [queryClient]);

  const value = useMemo(
    () => ({ status, requestCode, verifyCode, signOut }),
    [status, requestCode, verifyCode, signOut],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth outside AuthProvider");
  return ctx;
}
