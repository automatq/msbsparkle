import { useEffect, useState } from "react";
import { api } from "@/api";
import { secureTokenStore } from "./token-store";

/**
 * A current access token for requests made outside the API client, i.e. job photos loaded by
 * expo-image (which sends the header itself). Refreshes it when it is about to expire.
 */
export function useAccessToken() {
  const [token, setToken] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let t = await secureTokenStore.get();
      if (t && Date.parse(t.accessExpiresAt) - Date.now() < 60_000) t = await api.refresh();
      if (!cancelled) setToken(t?.accessToken ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return token;
}
