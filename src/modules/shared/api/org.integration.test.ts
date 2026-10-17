import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/modules/db/client";
import { ApiKeyError, hashApiKey, resolveOrgFromApiKey } from "./org";

const createdOrgIds: string[] = [];

afterEach(async () => {
  await prisma.organization.deleteMany({ where: { id: { in: createdOrgIds.splice(0) } } });
});

async function makeOrg(apiKey: string | null, allowedOrigin: string | null = null) {
  const org = await prisma.organization.create({
    data: {
      name: `Test org ${Date.now()}-${Math.random()}`,
      slug: `test-org-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
      apiKeyHash: apiKey ? hashApiKey(apiKey) : null,
      allowedOrigin,
    },
  });
  createdOrgIds.push(org.id);
  return org;
}

describe("resolveOrgFromApiKey", () => {
  it("resolves the organization for a valid key", async () => {
    const org = await makeOrg("test-key-abc", "https://app.example.com");
    const req = new Request("https://api.example.com/api/v1/services", {
      headers: { "x-api-key": "test-key-abc" },
    });
    await expect(resolveOrgFromApiKey(req)).resolves.toEqual({
      organizationId: org.id,
      allowedOrigin: "https://app.example.com",
    });
  });

  it("rejects a missing key", async () => {
    const req = new Request("https://api.example.com/api/v1/services");
    await expect(resolveOrgFromApiKey(req)).rejects.toThrow(ApiKeyError);
  });

  it("rejects an unknown key", async () => {
    await makeOrg("test-key-known");
    const req = new Request("https://api.example.com/api/v1/services", {
      headers: { "x-api-key": "test-key-wrong" },
    });
    await expect(resolveOrgFromApiKey(req)).rejects.toThrow(ApiKeyError);
  });
});
