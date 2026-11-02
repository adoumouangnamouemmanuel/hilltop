/*
 * next/image loader for Cloudflare. Unsplash resizes on its own CDN for free, so
 * those URLs get width and quality parameters.
 *
 * Listing photos on the R2 domain are stored at up to 1600px. When Cloudflare Image
 * Transformations is switched on for the zone (Images → Transformations, free up to
 * 5,000 unique sizes a month) and NEXT_PUBLIC_IMAGE_RESIZING=1 is set at build time,
 * they're requested through /cdn-cgi/image at the size each card actually shows, so
 * a grid on a phone downloads thumbnails instead of full photos. Without it they're
 * served as they are, which always works.
 */
const resizing = process.env.NEXT_PUBLIC_IMAGE_RESIZING === "1";
const PHOTO_HOST = "https://photos.hilltop.lumavok.com/";

export default function imageLoader({ src, width, quality }: { src: string; width: number; quality?: number }) {
  if (src.startsWith("https://images.unsplash.com/")) {
    const url = new URL(src);
    url.searchParams.set("w", String(width));
    url.searchParams.set("q", String(quality ?? 75));
    url.searchParams.set("auto", "format");
    url.searchParams.set("fit", "max");
    return url.toString();
  }
  if (src.startsWith("data:") || src.startsWith("blob:")) return src;
  if (resizing && src.startsWith(PHOTO_HOST)) {
    // Never wider than the stored photo; format=auto serves WebP or AVIF where supported.
    const options = `width=${Math.min(width, 1600)},quality=${quality ?? 75},format=auto,fit=scale-down`;
    return `${PHOTO_HOST}cdn-cgi/image/${options}/${src.slice(PHOTO_HOST.length)}`;
  }
  // Next.js expects the width to appear in the URL; it's ignored for files served as they are.
  return `${src}${src.includes("?") ? "&" : "?"}w=${width}`;
}
