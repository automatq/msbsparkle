import type { Role } from "@/generated/prisma/enums";

export type RoleClaim = { role: Role; regionId: string | null };

export const ADMIN_ROLES: Role[] = ["SUPER_ADMIN", "REGION_ADMIN"];

export function hasRole(roles: RoleClaim[], ...wanted: Role[]): boolean {
  return roles.some((r) => wanted.includes(r.role));
}

export function isSuperAdmin(roles: RoleClaim[]): boolean {
  return roles.some((r) => r.role === "SUPER_ADMIN");
}

/** Region ids a REGION_ADMIN is scoped to. Empty for super admins (meaning "all"). */
export function scopedRegionIds(roles: RoleClaim[]): string[] {
  if (isSuperAdmin(roles)) return [];
  return roles
    .filter((r) => r.role === "REGION_ADMIN" && r.regionId)
    .map((r) => r.regionId as string);
}

/** Where a user should land after login, by their highest-privilege role. */
export function homePathFor(roles: RoleClaim[]): string {
  if (hasRole(roles, "SUPER_ADMIN", "REGION_ADMIN")) return "/admin";
  if (hasRole(roles, "CLEANER")) return "/cleaner";
  return "/account";
}
