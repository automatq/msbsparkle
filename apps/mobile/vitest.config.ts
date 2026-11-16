import { defineConfig } from "vitest/config";

/** Unit tests for the app's plain TypeScript modules (no React Native runtime). */
export default defineConfig({
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
