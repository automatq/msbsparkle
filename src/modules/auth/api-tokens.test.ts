import { describe, expect, it } from "vitest";
import {
  ApiTokenError,
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
} from "./api-tokens";

const claims = { sub: "user_1", orgId: "org_1", sessionVersion: 3 };

describe("api-tokens", () => {
  it("round-trips an access token", async () => {
    const token = await signAccessToken(claims);
    const verified = await verifyAccessToken(token);
    expect(verified).toEqual(claims);
  });

  it("round-trips a refresh token", async () => {
    const token = await signRefreshToken(claims);
    const verified = await verifyRefreshToken(token);
    expect(verified).toEqual(claims);
  });

  it("rejects an access token verified as a refresh token", async () => {
    const token = await signAccessToken(claims);
    await expect(verifyRefreshToken(token)).rejects.toThrow(ApiTokenError);
  });

  it("rejects a refresh token verified as an access token", async () => {
    const token = await signRefreshToken(claims);
    await expect(verifyAccessToken(token)).rejects.toThrow(ApiTokenError);
  });

  it("rejects garbage", async () => {
    await expect(verifyAccessToken("not-a-token")).rejects.toThrow(ApiTokenError);
  });
});
