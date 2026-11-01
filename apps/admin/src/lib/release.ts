import type { PlatformConfig } from "@hilltop/shared/config";

/** One published version of the platform config. */
export type Release = {
  version: number;
  publishedAt: string;
  /** Name of the admin who published it. */
  by: string;
  note: string;
  /** Config paths that changed compared with the previous release. */
  changes: string[];
  config: PlatformConfig;
};

/** How many past releases are kept for rollback. */
export const RELEASE_HISTORY = 25;
