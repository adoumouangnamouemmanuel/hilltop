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

// The last published config this server read successfully. If the database can't be
// reached, pages keep using it rather than the built-in defaults, which may disagree
// with the rules the database enforces.
let lastGood: PlatformConfig | null = null;

function fallback(reason: string) {
  // Logged as an error so Sentry reports it: the marketplace may be showing stale rules.
  console.error(`Couldn't load the published config (${reason}); using ${lastGood ? "the last one loaded" : "the built-in defaults"}`);
  return lastGood ?? defaultConfig;
}

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
    if (!res.ok) return fallback(`status ${res.status}`);
    const [row] = (await res.json()) as ConfigRelease[];
    const { config, issues } = configFromRelease(row);
    if (issues.length) return fallback(`invalid: ${issues.slice(0, 3).join("; ")}`);
    lastGood = config;
    return config;
  } catch (e) {
    // An unreachable database must never take the marketplace down.
    return fallback(e instanceof Error ? e.message : "unreachable");
  }
}
