import * as Sentry from "@sentry/nextjs";
import { scrubBreadcrumb, scrubEvent } from "@hilltop/shared/telemetry";

// Browser error reporting. Only active in production builds, where the DSN is set.
// Personal data (emails, tokens, query strings) is removed before anything is sent.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: process.env.NODE_ENV === "production" && !!process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  environment: "production",
  beforeSend: scrubEvent,
  beforeBreadcrumb: scrubBreadcrumb,
  // Browser extensions' own errors aren't Hilltop's.
  denyUrls: [/^chrome-extension:\/\//, /^moz-extension:\/\//, /^safari-web-extension:\/\//],
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
