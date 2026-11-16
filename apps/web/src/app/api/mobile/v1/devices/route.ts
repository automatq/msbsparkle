import { registerDeviceBody, unregisterDeviceBody } from "@msb/shared/mobile-api";
import { prisma } from "@/modules/db/client";
import { apiOk, cleanerRoute, parseJson } from "@/modules/mobile-api/http";

export const runtime = "nodejs";

/**
 * Registers this device's Expo push token for the signed-in session. Call after sign-in and
 * whenever the token changes. A token moves to whoever registers it last (phones change hands);
 * pushes stop when the session ends.
 */
export const POST = cleanerRoute(async ({ req, auth }) => {
  const body = await parseJson(req, registerDeviceBody);
  if ("response" in body) return body.response;
  const { expoPushToken, platform } = body.data;
  const now = new Date();
  await prisma.pushDevice.upsert({
    where: { expoPushToken },
    update: {
      userId: auth.ctx.userId,
      mobileSessionId: auth.sessionId,
      platform,
      lastSeenAt: now,
      disabledAt: null,
      disabledReason: null,
    },
    create: {
      userId: auth.ctx.userId,
      mobileSessionId: auth.sessionId,
      expoPushToken,
      platform,
    },
  });
  return apiOk(null);
});

/** Stops pushes to this device (e.g. notifications turned off in the app). */
export const DELETE = cleanerRoute(async ({ req, auth }) => {
  const body = await parseJson(req, unregisterDeviceBody);
  if ("response" in body) return body.response;
  await prisma.pushDevice.updateMany({
    where: { expoPushToken: body.data.expoPushToken, userId: auth.ctx.userId, disabledAt: null },
    data: { disabledAt: new Date(), disabledReason: "unregistered by app" },
  });
  return apiOk(null);
});
