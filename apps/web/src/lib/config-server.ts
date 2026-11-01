import { defaultConfig, parseConfig, type PlatformConfig } from "@hilltop/shared/config";

/**
 * Where the admin portal publishes the live config, e.g. https://admin.example.com/api/config.
 * Without it the marketplace runs on the built-in defaults.
 */
export const CONFIG_URL = process.env.NEXT_PUBLIC_CONFIG_URL;

/** How often the server refetches the published config, in seconds. */
const REFRESH_SECONDS = 120;

/**
 * The live platform config, cached on the server and refetched every couple of
 * minutes. Pages that read it are regenerated on the same schedule.
 */
export async function getPlatformConfig(): Promise<PlatformConfig> {
  if (!CONFIG_URL) return defaultConfig;
  try {
    const res = await fetch(CONFIG_URL, {
      headers: { accept: "application/json" },
      next: { revalidate: REFRESH_SECONDS },
      // A slow admin portal must never hold a page up.
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return defaultConfig;
    const { config, issues } = parseConfig(await res.json());
    if (issues.length) console.warn("Published config has problems, using defaults:", issues);
    return config;
  } catch {
    // An unreachable admin portal must never take the marketplace down.
    return defaultConfig;
  }
}
