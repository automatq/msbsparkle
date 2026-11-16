/**
 * Push notifications: permission, the Android "jobs" channel (the server sends with
 * channelId "jobs"), the Expo token registered with the server, and taps that open a job.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { AndroidImportance } from "expo-notifications";
import { router } from "expo-router";
import { useEffect } from "react";
import { Platform } from "react-native";
import type { PushData } from "@msb/shared/mobile-api";
import { api } from "@/api";
import { EAS_PROJECT_ID } from "@/lib/config";

const TOKEN_KEY = "msb.push.token";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export type PushStatus = "registered" | "denied" | "unsupported" | "error";

/** Safe to call on every launch: re-registers the current token for this session. */
export async function registerForPush(): Promise<PushStatus> {
  if (!Device.isDevice || !EAS_PROJECT_ID) return "unsupported";
  if (Platform.OS === "android")
    await Notifications.setNotificationChannelAsync("jobs", {
      name: "Jobs",
      importance: AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
    });
  let perm = await Notifications.getPermissionsAsync();
  if (perm.status !== "granted" && perm.canAskAgain)
    perm = await Notifications.requestPermissionsAsync();
  if (perm.status !== "granted") return "denied";
  try {
    const { data: expoPushToken } = await Notifications.getExpoPushTokenAsync({
      projectId: EAS_PROJECT_ID,
    });
    await api.request("devices", {
      body: { expoPushToken, platform: Platform.OS === "ios" ? "ios" : "android" },
    });
    await AsyncStorage.setItem(TOKEN_KEY, expoPushToken);
    return "registered";
  } catch {
    return "error";
  }
}

/** Called on sign-out, before the session ends. */
export async function unregisterPush() {
  const expoPushToken = await AsyncStorage.getItem(TOKEN_KEY);
  if (expoPushToken)
    await api.request("devices", { method: "DELETE", body: { expoPushToken } }).catch(() => {});
  await AsyncStorage.removeItem(TOKEN_KEY);
}

function open(data: unknown) {
  const d = data as Partial<PushData> | undefined;
  if (d?.jobId) router.push({ pathname: "/jobs/[id]", params: { id: d.jobId } });
  else if (d?.kind) router.push("/");
}

/** Opens the job when a notification is tapped, including the one that launched the app. */
export function useNotificationTaps(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const last = Notifications.getLastNotificationResponse();
    if (last) {
      open(last.notification.request.content.data);
      Notifications.clearLastNotificationResponse();
    }
    const sub = Notifications.addNotificationResponseReceivedListener((r) =>
      open(r.notification.request.content.data),
    );
    return () => sub.remove();
  }, [enabled]);
}
