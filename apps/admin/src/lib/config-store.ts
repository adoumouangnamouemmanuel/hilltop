import "server-only";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { defaultConfig, diffConfig, platformConfigSchema, type PlatformConfig } from "@hilltop/shared/config";
import { RELEASE_HISTORY, type Release } from "./release";

/*
 * Published config storage. Releases are kept in a JSON file so they survive
 * restarts in development and on a server with a disk. Where the filesystem is
 * read-only (serverless), it falls back to memory; swap this module for a
 * database or KV store when the backend lands, the rest of the app won't change.
 */

const dir = process.env.CONFIG_STORE_DIR || path.join(process.cwd(), ".data");
const file = path.join(dir, "releases.json");

let memory: Release[] | null = null;

export async function listReleases(): Promise<Release[]> {
  try {
    const raw = JSON.parse(await readFile(file, "utf8")) as { releases?: Release[] };
    return Array.isArray(raw.releases) ? raw.releases : [];
  } catch {
    return memory ?? [];
  }
}

export async function currentConfig(): Promise<PlatformConfig> {
  const [latest] = await listReleases();
  return latest?.config ?? defaultConfig;
}

/** Validates and stores a new release on top of the current one. */
export async function publish(input: unknown, by: string, note: string): Promise<Release> {
  const releases = await listReleases();
  const previous = releases[0]?.config ?? defaultConfig;
  const version = (releases[0]?.version ?? defaultConfig.version) + 1;
  const publishedAt = new Date().toISOString();
  // Strict: a published config must be complete and valid, no silent defaults.
  const config = platformConfigSchema.parse({ ...(input as object), version, publishedAt });
  const release: Release = { version, publishedAt, by, note, changes: diffConfig(previous, config), config };
  const next = [release, ...releases].slice(0, RELEASE_HISTORY);
  memory = next;
  try {
    await mkdir(dir, { recursive: true });
    await writeFile(file, JSON.stringify({ releases: next }, null, 2));
  } catch {
    // Read-only filesystem: the release lives in memory until the process restarts.
  }
  return release;
}
