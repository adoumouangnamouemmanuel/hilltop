import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import r2IncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache";
import memoryQueue from "@opennextjs/cloudflare/overrides/queue/memory-queue";

/*
 * Cached pages and "use cache" results live in R2. Time-based revalidation (the
 * platform config is cached for a few minutes) uses the in-memory queue, which is
 * fine at campus traffic; switch to the Durable Object queue if traffic grows.
 */
export default defineCloudflareConfig({
  incrementalCache: r2IncrementalCache,
  queue: memoryQueue,
});
