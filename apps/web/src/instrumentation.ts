import type { Instrumentation } from "next";

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // Only real production deployments, not previews, CI builds or local `next start`.
  if (process.env.VERCEL_ENV !== "production") return;
  const { missingProductionConfig } = await import("@/modules/shared/prod-config");
  const { required, recommended } = missingProductionConfig();
  for (const v of required) console.error(`[config] ${v.name} is not set: ${v.why}.`);
  for (const v of recommended) console.warn(`[config] ${v.name} is not set: ${v.why}.`);
  try {
    const [{ isSetupPending }, { siteUrl }] = await Promise.all([
      import("@/modules/setup/setup"),
      import("@/modules/shared/site"),
    ]);
    if (await isSetupPending())
      console.warn(`[setup] No admin account yet. Finish setup at ${siteUrl}/setup`);
  } catch {
    // Database not reachable yet; /api/health will show it.
  }
}

/**
 * Logs every server error as one structured line, so it is searchable in Vercel's logs and can
 * be forwarded by a log drain. Swap in an error tracker (e.g. Sentry) here if you add one.
 */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  const e = err instanceof Error ? err : new Error(String(err));
  const digest =
    typeof err === "object" && err !== null && "digest" in err ? String(err.digest) : undefined;
  console.error(
    JSON.stringify({
      level: "error",
      msg: e.message,
      digest,
      stack: e.stack,
      method: request.method,
      path: request.path,
      routerKind: context.routerKind,
      routePath: context.routePath,
      routeType: context.routeType,
    }),
  );
};
