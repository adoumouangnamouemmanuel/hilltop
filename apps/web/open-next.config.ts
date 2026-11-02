import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import r2IncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache";
import doQueue from "@opennextjs/cloudflare/overrides/queue/do-queue";

/*
 * Cached pages and "use cache" results live in R2. Time-based revalidation (listings
 * every minute, the platform config every few) is queued in a Durable Object, so a
 * revalidation isn't lost when a Worker instance is recycled.
 */
export default defineCloudflareConfig({
  incrementalCache: r2IncrementalCache,
  queue: doQueue,
});
