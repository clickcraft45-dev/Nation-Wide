/** Long edge after compressing: an ID card's small print and a shipping label stay legible. */
export const MAX_IMAGE_EDGE_PX = 2000;
const JPEG_QUALITY = 0.8;

/** Matches the server's per-photo limit: what is sent uncompressed must still fit under it. */
export const MAX_UPLOAD_BYTES = 30 * 1024 * 1024;

/** The size a photo is scaled to so its long edge is at most `maxEdge`, never enlarged. */
export function fitWithin(width: number, height: number, maxEdge = MAX_IMAGE_EDGE_PX) {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/**
 * Shrinks a phone photo before it is uploaded: a 12-25 MB camera shot becomes a JPEG of a few
 * hundred KB, which matters on a partner's mobile data at the customer's door. Orientation is
 * applied (createImageBitmap honours EXIF), so the result is upright.
 *
 * Returns the original file when the browser cannot decode it (HEIC outside Safari, say) or when
 * compressing would not make it smaller. The server compresses again either way.
 */
export async function compressImage(file: File): Promise<File> {
  if (typeof createImageBitmap !== "function" || typeof document === "undefined") return file;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return file;
  }
  try {
    const { width, height } = fitWithin(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return file;
    context.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
    );
    if (!blob || blob.size >= file.size) return file;
    const name = file.name.replace(/\.[^.]+$/, "") || "photo";
    return new File([blob], `${name}.jpg`, { type: "image/jpeg", lastModified: file.lastModified });
  } finally {
    bitmap.close();
  }
}
