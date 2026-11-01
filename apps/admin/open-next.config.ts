import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Every admin page is rendered on request, so no incremental cache is needed.
export default defineCloudflareConfig({});
