"use client";

import { useEffect } from "react";
import { MotionConfig } from "framer-motion";
import type { PlatformConfig } from "@hilltop/shared/config";
import { ConfigProvider } from "@/lib/config";
import { seedMarket, type Market } from "@/lib/market";
import { useMarketRefresh } from "@/lib/use-market";
import { AuthSync } from "./auth-sync";
import { Pwa } from "./pwa";

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
        {children}
        <Pwa />
      </MotionConfig>
    </ConfigProvider>
  );
}
