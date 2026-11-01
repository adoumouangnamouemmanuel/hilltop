import path from "node:path";
import type { NextConfig } from "next";

// The monorepo root, so builds trace the shared packages.
const root = path.join(__dirname, "../..");

const nextConfig: NextConfig = {
  // The shared packages ship TypeScript source.
  transpilePackages: ["@hilltop/shared", "@hilltop/ui"],
  outputFileTracingRoot: root,
  images: {
    // Cloudflare has no built-in Next.js image optimiser; see packages/ui/src/image-loader.ts.
    loader: "custom",
    loaderFile: "../../packages/ui/src/image-loader.ts",
    // 90 is used by the gallery lens and full-screen viewer for sharper zoom.
    qualities: [75, 90],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
        pathname: "/photo-*",
      },
    ],
  },
  async headers() {
    return [
      {
        // The service worker must never be served stale, or updates won't reach users.
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
  turbopack: {
    root,
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
