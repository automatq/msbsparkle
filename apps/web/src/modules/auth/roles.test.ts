import { describe, expect, it } from "vitest";
import { rolesForSession, type RoleClaim } from "./roles";

const roles: RoleClaim[] = [
  { role: "SUPER_ADMIN", regionId: null },
  { role: "REGION_ADMIN", regionId: "r1" },
  { role: "CLEANER", regionId: null },
  { role: "CUSTOMER", regionId: null },
];

describe("rolesForSession", () => {
  it("keeps admin roles for a password sign-in, with or without 2FA", () => {
    expect(rolesForSession(roles, ["pwd"])).toEqual(roles);
    expect(rolesForSession(roles, ["pwd", "totp"])).toEqual(roles);
  });

  it.each([[["email"]], [["otp"]], [[]], [undefined]])(
    "drops admin roles for a %j session",
    (amr) => {
      expect(rolesForSession(roles, amr as string[] | undefined).map((r) => r.role)).toEqual([
        "CLEANER",
        "CUSTOMER",
      ]);
    },
  );
});
