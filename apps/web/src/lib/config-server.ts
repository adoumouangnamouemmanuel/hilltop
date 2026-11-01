import { configFromRelease, defaultConfig, type ConfigRelease, type PlatformConfig } from "@hilltop/shared/config";

/**
 * The published config lives in the database (current_config view), which anyone
 * may read. Without Supabase settings the marketplace runs on the built-in defaults.
 */
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
export const CONFIG_URL = SUPABASE_URL ? `${SUPABASE_URL}/rest/v1/current_config?select=config,version,published_at` : undefined;

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
      headers: { accept: "application/json", apikey: SUPABASE_KEY ?? "" },
      next: { revalidate: REFRESH_SECONDS },
      // A slow database must never hold a page up.
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return defaultConfig;
    const [row] = (await res.json()) as ConfigRelease[];
    const { config, issues } = configFromRelease(row);
    if (issues.length) console.warn("Published config has problems, using defaults:", issues);
    return config;
  } catch {
    // An unreachable database must never take the marketplace down.
    return defaultConfig;
  }
}
