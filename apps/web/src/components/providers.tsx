"use client";

import { useEffect, useSyncExternalStore } from "react";
import { MotionConfig } from "framer-motion";
import type { PlatformConfig } from "@hilltop/shared/config";
import { ConfigProvider } from "@/lib/config";
import { seedMarket, readMarket, refreshMarket, setMarket, type Market } from "@/lib/market";
import { useMarket, useMarketRefresh } from "@/lib/use-market";
import { useStore } from "@/lib/store";
import { AuthSync } from "./auth-sync";
import { Pwa } from "./pwa";
import { PushPrompt } from "./notifications";

export function Providers({ config, market, children }: { config: PlatformConfig; market: Market; children: React.ReactNode }) {
  // The listings the server rendered with, available to everything below from the first render.
  seedMarket(market);
  useMarketRefresh();

  // Marks when the app is interactive, so end-to-end tests don't act before hydration.
  useEffect(() => {
    document.documentElement.dataset.hydrated = "true";
  }, []);

  return (
    <ConfigProvider initial={config}>
      <MotionConfig reducedMotion="user">
        <AuthSync />
        <SyncStatus />
        {children}
        <Pwa />
        <PushPrompt floating />
      </MotionConfig>
    </ConfigProvider>
  );
}

const subscribeNetwork = (listener: () => void) => {
  window.addEventListener("online", listener);
  window.addEventListener("offline", listener);
  return () => {
    window.removeEventListener("online", listener);
    window.removeEventListener("offline", listener);
  };
};
function SyncStatus() {
  const online = useSyncExternalStore(
    subscribeNetwork,
    () => navigator.onLine,
    () => true,
  );
  const market = useMarket();
  const { syncError, mineSyncError, refreshMine, refreshSocial } = useStore();
  const error = !online ? "You're offline. Reconnect to send messages or save changes." : (mineSyncError ?? syncError ?? market.error);
  if (!error) return null;
  return (
    <div role="status" className="flex items-center justify-center gap-3 bg-warning-bg px-4 py-2 text-sm text-warning">
      <span>{error}</span>
      <button
        type="button"
        className="min-h-11 underline"
        onClick={() => {
          void refreshMine();
          void refreshSocial();
          void refreshMarket()
            .then(setMarket)
            .catch(() => setMarket({ ...readMarket(), error: "Listings are still unavailable. Please retry shortly." }));
        }}
      >
        Retry
      </button>
    </div>
  );
}
