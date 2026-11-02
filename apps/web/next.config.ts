import path from "node:path";
import type { NextConfig } from "next";

// The monorepo root, so builds trace the shared packages.
const root = path.join(__dirname, "../..");

const dev = process.env.NODE_ENV !== "production";
const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

/*
 * Content Security Policy: scripts only from this site, data only from Supabase and
 * Sentry, images from the photo bucket and Unsplash, and nothing may frame the page.
 * Pages are prerendered, so per-request nonces aren't possible; Next's inline
 * bootstrap needs 'unsafe-inline' for scripts, and the rest of the policy still
 * keeps out other sites' scripts, connections, frames, plugins and form targets.
 * (data: and blob: connections are the browser reading its own photos before upload.)
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: https://images.unsplash.com https://photos.hilltop.lumavok.com${dev ? " http://localhost:* http://127.0.0.1:*" : ""}`,
  "font-src 'self' data:",
  `connect-src 'self' data: blob: ${supabase} ${supabase.replace(/^http/, "ws")} https://*.ingest.sentry.io https://*.ingest.us.sentry.io${dev ? " ws://localhost:* ws://127.0.0.1:*" : ""}`,
  "worker-src 'self'",
  "manifest-src 'self'",
  "frame-src 'none'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  ...(dev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()" },
  ...(dev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }]),
];

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
        headers: [...securityHeaders, { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" }],
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
