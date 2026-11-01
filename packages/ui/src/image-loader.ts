/*
 * next/image loader for Cloudflare. Unsplash resizes on its own CDN for free, so
 * those URLs get width and quality parameters. Everything else (static imports,
 * photos on our R2 domain) is served as it is; resizing those through Cloudflare
 * Images can be added later if bandwidth becomes a concern.
 */
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
  // Next.js expects the width to appear in the URL; it's ignored for files served as they are.
  return `${src}${src.includes("?") ? "&" : "?"}w=${width}`;
}
