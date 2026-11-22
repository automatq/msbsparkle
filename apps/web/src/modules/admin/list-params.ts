/**
 * Shared parsing for admin list pages: every filter, the sort and the page live in the URL so a
 * list can be bookmarked or shared. Pure functions, safe on the server and in tests.
 */

export const PAGE_SIZE = 50;

type SearchParams = Record<string, string | string[] | undefined>;

/** A single string param, or "" when missing or repeated. */
export function param(p: SearchParams, key: string): string {
  const v = p[key];
  return typeof v === "string" ? v : "";
}

/** A param restricted to `allowed`, or "" (unknown values are ignored rather than trusted). */
export function oneOf<T extends string>(
  p: SearchParams,
  key: string,
  allowed: readonly T[],
): T | "" {
  const v = param(p, key);
  return (allowed as readonly string[]).includes(v) ? (v as T) : "";
}

/** 1-based page from `?page=`, clamped to at least 1. */
export function pageParam(p: SearchParams): number {
  const n = Number.parseInt(param(p, "page"), 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

export function skipTake(page: number, size = PAGE_SIZE) {
  return { skip: (page - 1) * size, take: size };
}

export type SortDir = "asc" | "desc";

/**
 * `?sort=<key>&dir=asc|desc`, restricted to the page's sortable keys. Falls back to the page's
 * default when the key is unknown.
 */
export function sortParam<K extends string>(
  p: SearchParams,
  keys: readonly K[],
  fallback: { key: K; dir: SortDir },
): { key: K; dir: SortDir } {
  const key = oneOf(p, "sort", keys);
  if (!key) return fallback;
  return { key, dir: param(p, "dir") === "asc" ? "asc" : "desc" };
}
