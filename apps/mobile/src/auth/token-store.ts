import * as SecureStore from "expo-secure-store";
import type { TokenPair } from "@msb/shared/mobile-api";
import type { TokenStore } from "@/api/client";

const KEY = "msb.session";

/** Tokens live in the Keychain / Android Keystore, readable after first unlock (for background tasks). */
export const secureTokenStore: TokenStore = {
  async get() {
    const raw = await SecureStore.getItemAsync(KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as TokenPair;
    } catch {
      return null;
    }
  },
  async set(tokens) {
    if (!tokens) await SecureStore.deleteItemAsync(KEY);
    else
      await SecureStore.setItemAsync(KEY, JSON.stringify(tokens), {
        keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
      });
  },
};
