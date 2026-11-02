import { defineConfig, devices } from "@playwright/test";

// Browser-level regression tests use the real decoder and service worker without
// depending on a production Next build or credentials for a marketplace account.
export default defineConfig({
  testDir: "tests/browser",
  workers: 1,
  timeout: 90_000,
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
