import type { Metadata } from "next";
import { WifiOff } from "lucide-react";
import { ButtonLink } from "@/components/ui";

export const metadata: Metadata = { title: "You're offline" };

/** Cached by the service worker and shown when a page can't load without a connection. */
export default function OfflinePage() {
  return (
    <div className="container-page flex flex-col items-center py-24 text-center">
      <span className="grid size-14 place-items-center rounded-2xl bg-surface text-ink-950">
        <WifiOff className="size-6" aria-hidden />
      </span>
      <h1 className="mt-5 text-2xl font-semibold tracking-[-0.025em] text-ink-950">You&rsquo;re offline</h1>
      <p className="mt-2 max-w-sm text-sm text-ink-500">
        Pages you&rsquo;ve opened before still work. Reconnect to see new listings, messages and orders.
      </p>
      <ButtonLink href="/" variant="dark" className="mt-6">
        Try again
      </ButtonLink>
    </div>
  );
}
