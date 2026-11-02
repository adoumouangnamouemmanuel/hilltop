/**
 * Shrinks a photo before it's stored, so phone pictures (often 3 to 6MB) don't fill up
 * browser storage. Long edge capped at `maxSize`, re-encoded as JPEG.
 */
export async function compressImage(file: File, maxSize = 1600, quality = 0.82): Promise<string> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return canvas.toDataURL("image/jpeg", quality);
  } catch {
    // Formats the browser can't decode (e.g. some HEIC) are kept as-is.
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = () => reject(r.error);
      r.readAsDataURL(file);
    });
  }
}

/** Approximate size in KB of a data URL, for showing upload sizes. */
export const dataUrlKb = (url: string) => Math.round((url.length * 3) / 4 / 1024);
