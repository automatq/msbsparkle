import Constants from "expo-constants";

/**
 * The company's web deployment that serves the API. Set at build time (API_URL, see
 * app.config.ts); EXPO_PUBLIC_API_URL overrides it for local development
 * (e.g. http://192.168.1.20:3000 to reach `pnpm dev` from a phone on the same Wi-Fi).
 */
export const API_URL: string =
  process.env.EXPO_PUBLIC_API_URL ||
  (Constants.expoConfig?.extra?.apiUrl as string | undefined) ||
  "https://msbsparkle.vercel.app";

export const EAS_PROJECT_ID: string | undefined = (
  Constants.expoConfig?.extra?.eas as { projectId?: string } | undefined
)?.projectId;
