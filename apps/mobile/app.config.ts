import type { ConfigContext, ExpoConfig } from "expo/config";

/**
 * The cleaner app is built per company, like the web app is deployed per company. Everything
 * company-specific comes from the environment at build time (eas.json profiles or `.env`):
 *
 *   APP_NAME          "MSB Sparkle Cleaner"
 *   APP_ID            reverse-DNS bundle id / Android package, e.g. com.msbsparkle.cleaner
 *   APP_SCHEME        deep-link scheme, e.g. msbsparkle-cleaner
 *   API_URL           the company's web deployment, e.g. https://msbsparkle.vercel.app
 *   EAS_PROJECT_ID    from `eas init` (needed for push tokens)
 */
const env = (k: string, fallback: string) => process.env[k]?.trim() || fallback;

const name = env("APP_NAME", "MSB Sparkle Cleaner");
const id = env("APP_ID", "com.msbsparkle.cleaner");
const scheme = env("APP_SCHEME", "msbsparkle-cleaner");
const apiUrl = env("API_URL", "https://msbsparkle.vercel.app");
const projectId = process.env.EAS_PROJECT_ID?.trim();

const LOCATION_WHY = `${name} shares your location with the customer only between tapping "On my way" and checking in, so they can see when you'll arrive.`;

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name,
  slug: env("APP_SLUG", "msb-cleaner"),
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/images/icon.png",
  scheme,
  userInterfaceStyle: "automatic",
  ios: {
    bundleIdentifier: id,
    supportsTablet: false,
    infoPlist: {
      NSLocationWhenInUseUsageDescription: LOCATION_WHY,
      NSLocationAlwaysAndWhenInUseUsageDescription: LOCATION_WHY,
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    package: id,
    adaptiveIcon: {
      backgroundColor: "#E6F4FE",
      foregroundImage: "./assets/images/android-icon-foreground.png",
      backgroundImage: "./assets/images/android-icon-background.png",
      monochromeImage: "./assets/images/android-icon-monochrome.png",
    },
    predictiveBackGestureEnabled: false,
    // Pulled in by expo-image-picker (video, legacy storage); the app only takes photos.
    blockedPermissions: [
      "android.permission.RECORD_AUDIO",
      "android.permission.READ_EXTERNAL_STORAGE",
      "android.permission.WRITE_EXTERNAL_STORAGE",
    ],
  },
  plugins: [
    "expo-router",
    "expo-secure-store",
    [
      "expo-splash-screen",
      {
        backgroundColor: "#111111",
        image: "./assets/images/splash-icon.png",
        imageWidth: 76,
      },
    ],
    [
      "expo-location",
      {
        locationAlwaysAndWhenInUsePermission: LOCATION_WHY,
        locationWhenInUsePermission: LOCATION_WHY,
        isIosBackgroundLocationEnabled: true,
        isAndroidBackgroundLocationEnabled: true,
        isAndroidForegroundServiceEnabled: true,
      },
    ],
    [
      "expo-image-picker",
      {
        cameraPermission: `${name} uses the camera for before and after photos of the jobs you clean.`,
        photosPermission: `${name} lets you attach job photos from your library.`,
        microphonePermission: false,
      },
    ],
    ["expo-notifications", { color: "#111111" }],
  ],
  experiments: { typedRoutes: true, reactCompiler: true },
  extra: {
    apiUrl,
    ...(projectId ? { eas: { projectId } } : {}),
  },
});
