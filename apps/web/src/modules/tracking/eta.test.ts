import { afterEach, describe, expect, it, vi } from "vitest";
import { driveSeconds, staticMapUrl, straightLineSeconds } from "./eta";

const cnTower = { lat: 43.6426, lng: -79.3871 };
const yorkdale = { lat: 43.7254, lng: -79.4522 }; // ~10.6 km away

describe("ETA", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("straight-line: ~10.6 km × 1.4 detour at 35 km/h is about 25 minutes", () => {
    const min = straightLineSeconds(cnTower, yorkdale) / 60;
    expect(min).toBeGreaterThan(23);
    expect(min).toBeLessThan(28);
  });

  it("uses Mapbox when configured", async () => {
    vi.stubEnv("MAPBOX_ACCESS_TOKEN", "sk.test");
    const fetchImpl = vi.fn<(url: string) => Promise<Response>>(async () =>
      Response.json({ routes: [{ duration: 1234.4 }] }),
    );
    expect(await driveSeconds(cnTower, yorkdale, fetchImpl as typeof fetch)).toEqual({
      seconds: 1234,
      source: "mapbox",
    });
    expect(String(fetchImpl.mock.calls[0]?.[0])).toContain(
      "/driving-traffic/-79.3871,43.6426;-79.4522,43.7254",
    );
  });

  it("falls back to straight line when Mapbox fails or isn't configured", async () => {
    const failing = vi.fn(async () => {
      throw new Error("timeout");
    });
    vi.stubEnv("MAPBOX_ACCESS_TOKEN", "sk.test");
    expect((await driveSeconds(cnTower, yorkdale, failing as typeof fetch)).source).toBe(
      "straight-line",
    );
    vi.stubEnv("MAPBOX_ACCESS_TOKEN", "");
    const unused = vi.fn();
    expect((await driveSeconds(cnTower, yorkdale, unused as typeof fetch)).source).toBe(
      "straight-line",
    );
    expect(unused).not.toHaveBeenCalled();
  });

  it("static map only with a public token; pins the cleaner and the home", () => {
    vi.stubEnv("NEXT_PUBLIC_MAPBOX_TOKEN", "");
    expect(staticMapUrl(cnTower, yorkdale)).toBeNull();
    vi.stubEnv("NEXT_PUBLIC_MAPBOX_TOKEN", "pk.test");
    const url = staticMapUrl(cnTower, yorkdale)!;
    expect(url).toContain("pin-s-car+2563eb(-79.38710,43.64260)");
    expect(url).toContain("pin-l-home+dc2626(-79.45220,43.72540)");
    expect(url).toContain("access_token=pk.test");
    expect(staticMapUrl(null, yorkdale)).toContain("/-79.45220,43.72540,14/");
  });
});
