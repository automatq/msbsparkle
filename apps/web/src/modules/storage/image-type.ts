/**
 * Detects the image type from the file's leading bytes. Returns null for anything that is not a
 * raster photo format we accept (notably SVG, which can carry script).
 */
export function sniffImageType(
  buf: Uint8Array,
): "image/jpeg" | "image/png" | "image/webp" | "image/heic" | null {
  const at = (i: number) => buf[i];
  const ascii = (start: number, len: number) =>
    String.fromCharCode(...buf.subarray(start, start + len));
  if (buf.length < 12) return null;
  if (at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) return "image/jpeg";
  if (ascii(1, 3) === "PNG" && at(0) === 0x89 && at(4) === 0x0d && at(5) === 0x0a)
    return "image/png";
  if (ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP") return "image/webp";
  if (ascii(4, 4) === "ftyp" && /^(heic|heix|hevc|heim|heis|mif1|msf1)$/.test(ascii(8, 4)))
    return "image/heic";
  return null;
}
