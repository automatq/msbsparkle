import type { Role } from "@/generated/prisma/enums";

export type RoleClaim = { role: Role; regionId: string | null };

export const ADMIN_ROLES: Role[] = ["SUPER_ADMIN", "REGION_ADMIN"];

export function hasRole(roles: RoleClaim[], ...wanted: Role[]): boolean {
  return roles.some((r) => wanted.includes(r.role));
}

export function isSuperAdmin(roles: RoleClaim[]): boolean {
  return roles.some((r) => r.role === "SUPER_ADMIN");
}

/**
 * The roles a session may use, given how it signed in (`amr`). Admin roles only count for a
 * password sign-in at /admin/login, which is also where 2FA is checked. A magic link or a mobile
 * code proves control of an inbox or a phone, not the admin password and authenticator, so a
 * session started that way never carries admin rights, even for a login that has them.
 */
export function rolesForSession(roles: RoleClaim[], amr: string[] | undefined): RoleClaim[] {
  if (amr?.includes("pwd")) return roles;
  return roles.filter((r) => !ADMIN_ROLES.includes(r.role));
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
