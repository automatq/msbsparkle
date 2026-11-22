import { describe, expect, it } from "vitest";
import { bearerKey, generateApiKey, hashApiKey } from "./keys";

describe("API keys", () => {
  it("generates long random sk_ keys", () => {
    const a = generateApiKey();
    expect(a).toMatch(/^sk_[A-Za-z0-9_-]{43}$/);
    expect(generateApiKey()).not.toBe(a);
  });

  it("hashes deterministically without containing the key", () => {
    const k = generateApiKey();
    expect(hashApiKey(k)).toBe(hashApiKey(k));
    expect(hashApiKey(k)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashApiKey(k)).not.toContain(k.slice(3, 13));
  });

  it("reads only well-formed bearer keys", () => {
    const k = generateApiKey();
    expect(bearerKey(`Bearer ${k}`)).toBe(k);
    expect(bearerKey(`bearer   ${k} `)).toBe(k);
    expect(bearerKey(k)).toBeNull();
    expect(bearerKey(`Basic ${k}`)).toBeNull();
    expect(bearerKey("Bearer pk_" + k.slice(3))).toBeNull();
    expect(bearerKey("Bearer sk_short")).toBeNull();
    expect(bearerKey(null)).toBeNull();
  });
});
