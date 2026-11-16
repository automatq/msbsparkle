/** Longest edge of an uploaded photo, in pixels. Plenty for proof-of-work photos. */
const MAX_EDGE = 2000;
const QUALITY = 0.82;

/**
 * Re-encodes a camera photo as a JPEG no larger than MAX_EDGE on its longest side, so uploads stay
 * well under the Server Action body limit (phone photos are often 3–8 MB). This also drops EXIF
 * metadata such as GPS. Falls back to the original file if the browser cannot decode it.
 */
export async function compressImage(file: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx2d = canvas.getContext("2d");
    if (!ctx2d) return file;
    ctx2d.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", QUALITY),
    );
    if (!blob) return file;
    const name = file.name.replace(/\.[^.]+$/, "") || "photo";
    return new File([blob], `${name}.jpg`, { type: "image/jpeg" });
  } catch {
    return file;
  }
}
