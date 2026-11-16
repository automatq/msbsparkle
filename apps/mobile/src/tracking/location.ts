/**
 * Background location between "On my way" and check-in. The task is defined at module load
 * (import this file from the root layout) because the OS can wake the app just to run it.
 *
 * Privacy: updates start only when the cleaner taps "On my way" and stop as soon as the server
 * answers `tracking: false` (checked in, cancelled, reassigned) or the cleaner checks in.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import type { LocationPing, LocationResult } from "@msb/shared/mobile-api";
import { api } from "@/api";

export const LOCATION_TASK = "msb-on-the-way";
const ACTIVE_JOB_KEY = "msb.tracking.jobId";

type TaskData = { locations?: Location.LocationObject[] };

TaskManager.defineTask<TaskData>(LOCATION_TASK, async ({ data, error }) => {
  if (error || !data?.locations?.length) return;
  const jobId = await AsyncStorage.getItem(ACTIVE_JOB_KEY);
  if (!jobId) {
    await stopTracking();
    return;
  }
  const pings: LocationPing[] = data.locations.slice(-50).map((l) => ({
    lat: l.coords.latitude,
    lng: l.coords.longitude,
    accuracyM: l.coords.accuracy ?? undefined,
    recordedAt: new Date(l.timestamp).toISOString(),
  }));
  try {
    const r = await api.request<LocationResult>(`jobs/${jobId}/location`, { body: { pings } });
    if (!r.data.tracking) await stopTracking();
  } catch {
    // Offline or a server hiccup: the next batch tries again. A signed-out session stops below.
    if (!(await api.hasSession())) await stopTracking();
  }
});

export type TrackingPermission = "background" | "foreground-only" | "denied";

/** Asks for location; background is needed for updates while the phone is locked. */
export async function requestTrackingPermission(): Promise<TrackingPermission> {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== "granted") return "denied";
  const bg = await Location.requestBackgroundPermissionsAsync();
  return bg.status === "granted" ? "background" : "foreground-only";
}

/** One position for "On my way", check-in and check-out. Null if unavailable within 8s. */
export async function currentPosition(): Promise<{ lat: number; lng: number } | null> {
  try {
    const perm = await Location.getForegroundPermissionsAsync();
    if (perm.status !== "granted") return null;
    const last = await Location.getLastKnownPositionAsync({ maxAge: 60_000 });
    const fix =
      last ??
      (await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
        new Promise<null>((r) => setTimeout(() => r(null), 8000)),
      ]));
    return fix ? { lat: fix.coords.latitude, lng: fix.coords.longitude } : null;
  } catch {
    return null;
  }
}

export async function startTracking(jobId: string) {
  await AsyncStorage.setItem(ACTIVE_JOB_KEY, jobId);
  const perm = await Location.getBackgroundPermissionsAsync();
  if (perm.status !== "granted") return false;
  if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK)) return true;
  await Location.startLocationUpdatesAsync(LOCATION_TASK, {
    accuracy: Location.Accuracy.Balanced,
    timeInterval: 30_000,
    distanceInterval: 75,
    deferredUpdatesInterval: 30_000,
    activityType: Location.ActivityType.AutomotiveNavigation,
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: "Sharing your location with the customer",
      notificationBody: "Until you check in at the job.",
      notificationColor: "#111111",
    },
  });
  return true;
}

export async function stopTracking() {
  await AsyncStorage.removeItem(ACTIVE_JOB_KEY);
  if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK).catch(() => false))
    await Location.stopLocationUpdatesAsync(LOCATION_TASK);
}

export async function trackingJobId() {
  return AsyncStorage.getItem(ACTIVE_JOB_KEY);
}
