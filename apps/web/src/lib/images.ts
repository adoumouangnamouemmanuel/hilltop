/**
 * Shrinks a photo before it's stored, so phone pictures (often 3 to 6MB) don't fill up
 * browser storage. Long edge capped at `maxSize`, re-encoded as JPEG.
 */
export async function compressImage(file: File, maxSize = 1600, quality = 0.82): Promise<string> {
  if (file.size > 25 * 1024 * 1024) throw new Error("Choose a photo smaller than 25 MB.");
  let image: ImageBitmap | HTMLImageElement;
  try {
    image = await createImageBitmap(file);
  } catch {
    // Some browsers decode camera formats through <img> but not ImageBitmap.
    const url = URL.createObjectURL(file);
    try {
      const element = new Image();
      element.src = url;
      await element.decode();
      image = element;
    } catch {
      const heic = /\.(heic|heif)$/i.test(file.name) || /^image\/hei[cf]/i.test(file.type);
      // The decoder is downloaded only for HEIC, and decodes in its own worker.
      // Sniff unnamed/octet-stream HEIF files as well as camera extensions.
      const header = new Uint8Array(await file.slice(0, 64).arrayBuffer());
      const brands = String.fromCharCode(...header);
      const isHeic = heic || (brands.slice(4, 8) === "ftyp" && /hei[cf]|heix|hevc|mif1|msf1/.test(brands.slice(8)));
      if (!isHeic) throw new Error("This photo couldn't be read. Choose a JPEG, PNG, WebP or HEIC photo.");
      try {
        const { heicTo } = await import("heic-to/csp");
        image = await heicTo({ blob: file, type: "bitmap" });
      } catch {
        throw new Error("Couldn't convert this HEIC photo. It may be damaged. Choose another photo or export it as JPEG.");
      }
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  try {
    if (image.width * image.height > 60_000_000) throw new Error("This photo's resolution is too large. Choose a smaller photo.");
    const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Couldn't prepare this photo. Try again or choose a smaller photo.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", quality);
  } finally {
    if ("close" in image) image.close();
  }
}

/** Approximate size in KB of a data URL, for showing upload sizes. */
export const dataUrlKb = (url: string) => Math.round((url.length * 3) / 4 / 1024);
