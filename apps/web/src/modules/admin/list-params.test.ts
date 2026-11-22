import { describe, expect, it } from "vitest";
import { oneOf, pageParam, param, skipTake, sortParam } from "./list-params";

describe("list params", () => {
  it("reads single string params only", () => {
    expect(param({ q: "smith" }, "q")).toBe("smith");
    expect(param({ q: ["a", "b"] }, "q")).toBe("");
    expect(param({}, "q")).toBe("");
  });

  it("ignores values outside the allowed list", () => {
    const allowed = ["ACTIVE", "PAUSED"] as const;
    expect(oneOf({ status: "PAUSED" }, "status", allowed)).toBe("PAUSED");
    expect(oneOf({ status: "DROP TABLE" }, "status", allowed)).toBe("");
  });

  it("clamps the page to 1 or more", () => {
    expect(pageParam({ page: "3" })).toBe(3);
    expect(pageParam({ page: "0" })).toBe(1);
    expect(pageParam({ page: "-2" })).toBe(1);
    expect(pageParam({ page: "abc" })).toBe(1);
    expect(pageParam({})).toBe(1);
  });

  it("turns a page into skip/take", () => {
    expect(skipTake(1)).toEqual({ skip: 0, take: 50 });
    expect(skipTake(3, 20)).toEqual({ skip: 40, take: 20 });
  });

  it("falls back to the default sort for unknown keys", () => {
    const keys = ["created", "name"] as const;
    const fallback = { key: "created", dir: "desc" } as const;
    expect(sortParam({ sort: "name", dir: "asc" }, keys, fallback)).toEqual({
      key: "name",
      dir: "asc",
    });
    expect(sortParam({ sort: "name" }, keys, fallback)).toEqual({ key: "name", dir: "desc" });
    expect(sortParam({ sort: "password" }, keys, fallback)).toEqual(fallback);
  });
});
