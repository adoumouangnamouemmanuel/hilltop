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
    remotePatterns: [{ protocol: "https", hostname: "images.unsplash.com", pathname: "/photo-*" }],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "same-origin" },
          // The admin portal should never show up in search results.
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
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
