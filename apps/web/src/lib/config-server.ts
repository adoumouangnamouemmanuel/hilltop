import { cacheLife } from "next/cache";
import { defaultConfig, parseConfig, type PlatformConfig } from "@hilltop/shared/config";

/**
 * Where the admin portal publishes the live config, e.g. https://admin.example.com/api/config.
 * Without it the marketplace runs on the built-in defaults.
 */
export const CONFIG_URL = process.env.NEXT_PUBLIC_CONFIG_URL;

/** The live platform config, cached for a few minutes on the server. */
export async function getPlatformConfig(): Promise<PlatformConfig> {
  "use cache";
  cacheLife("minutes");
  if (!CONFIG_URL) return defaultConfig;
  try {
    const res = await fetch(CONFIG_URL, { headers: { accept: "application/json" } });
    if (!res.ok) return defaultConfig;
    const { config, issues } = parseConfig(await res.json());
    if (issues.length) console.warn("Published config has problems, using defaults:", issues);
    return config;
  } catch {
    // An unreachable admin portal must never take the marketplace down.
    return defaultConfig;
  }
}
