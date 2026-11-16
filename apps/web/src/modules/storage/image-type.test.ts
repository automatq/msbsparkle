import { describe, expect, it } from "vitest";
import { sniffImageType } from "./image-type";

const bytes = (...parts: (number[] | string)[]) =>
  new Uint8Array(
    parts.flatMap((p) => (typeof p === "string" ? [...p].map((c) => c.charCodeAt(0)) : p)),
  );
const pad = new Array(16).fill(0);

describe("sniffImageType", () => {
  it("recognises accepted raster formats", () => {
    expect(sniffImageType(bytes([0xff, 0xd8, 0xff, 0xe0], pad))).toBe("image/jpeg");
    expect(sniffImageType(bytes([0x89], "PNG", [0x0d, 0x0a, 0x1a, 0x0a], pad))).toBe("image/png");
    expect(sniffImageType(bytes("RIFF", [0, 0, 0, 0], "WEBP", pad))).toBe("image/webp");
    expect(sniffImageType(bytes([0, 0, 0, 24], "ftypheic", pad))).toBe("image/heic");
  });

  it("rejects SVG, HTML and short input regardless of claimed type", () => {
    expect(sniffImageType(bytes('<svg xmlns="http://www.w3.org/2000/svg">'))).toBeNull();
    expect(sniffImageType(bytes("<!doctype html><script>", pad))).toBeNull();
    expect(sniffImageType(bytes([0xff, 0xd8]))).toBeNull();
  });
});
