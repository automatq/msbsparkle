/**
 * Drive-time estimates for live tracking. Uses Mapbox Directions (traffic-aware) when
 * MAPBOX_ACCESS_TOKEN is set; otherwise, or if Mapbox is slow or fails, a straight-line estimate.
 */
import { haversineKm, type Point } from "@/modules/shared/geo";

/** Roads are longer than the crow flies, and city driving is slow. */
const DETOUR = 1.4;
const CITY_KMH = 35;
const MAPBOX_TIMEOUT_MS = 3000;

export type DriveEstimate = { seconds: number; source: "mapbox" | "straight-line" };

export function straightLineSeconds(from: Point, to: Point): number {
  const km = haversineKm(from, to) * DETOUR;
  return Math.round((km / CITY_KMH) * 3600);
}

export async function driveSeconds(
  from: Point,
  to: Point,
  fetchImpl: typeof fetch = fetch,
): Promise<DriveEstimate> {
  const token = process.env.MAPBOX_ACCESS_TOKEN;
  if (token) {
    try {
      const coords = `${from.lng},${from.lat};${to.lng},${to.lat}`;
      const url = `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${coords}?overview=false&access_token=${encodeURIComponent(token)}`;
      const res = await fetchImpl(url, { signal: AbortSignal.timeout(MAPBOX_TIMEOUT_MS) });
      const json = (await res.json()) as { routes?: { duration: number }[] };
      const seconds = json.routes?.[0]?.duration;
      if (res.ok && typeof seconds === "number")
        return { seconds: Math.round(seconds), source: "mapbox" };
    } catch (e) {
      console.warn("[eta] mapbox failed, using straight line:", e instanceof Error ? e.message : e);
    }
  }
  return { seconds: straightLineSeconds(from, to), source: "straight-line" };
}

/** Static map for the customer's tracking page: cleaner (blue) and home (red). */
export function staticMapUrl(cleaner: Point | null, home: Point, size = { w: 600, h: 360 }) {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  if (!token) return null;
  const pins = [
    ...(cleaner ? [`pin-s-car+2563eb(${cleaner.lng.toFixed(5)},${cleaner.lat.toFixed(5)})`] : []),
    `pin-l-home+dc2626(${home.lng.toFixed(5)},${home.lat.toFixed(5)})`,
  ].join(",");
  const view = cleaner ? "auto" : `${home.lng.toFixed(5)},${home.lat.toFixed(5)},14`;
  return `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/${pins}/${view}/${size.w}x${size.h}@2x?padding=60&access_token=${encodeURIComponent(token)}`;
}
