import { secureTokenStore } from "@/auth/token-store";
import { API_URL } from "@/lib/config";
import { createApiClient } from "./client";

type Listener = () => void;
const sessionEndedListeners = new Set<Listener>();

/** Fires when the server ends the session (revoked, expired, replayed refresh token). */
export function onSessionEnded(listener: Listener) {
  sessionEndedListeners.add(listener);
  return () => {
    sessionEndedListeners.delete(listener);
  };
}

/** The app-wide client. Also used by the background location task, outside React. */
export const api = createApiClient({
  baseUrl: API_URL,
  store: secureTokenStore,
  onSessionEnded: () => sessionEndedListeners.forEach((l) => l()),
});

export { ApiRequestError } from "./client";
