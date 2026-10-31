"use client";

import { useEffect } from "react";
import { MotionConfig } from "framer-motion";
import type { PlatformConfig } from "@hilltop/shared/config";
import { ConfigProvider } from "@/lib/config";
import { Pwa } from "./pwa";

export function Providers({ config, children }: { config: PlatformConfig; children: React.ReactNode }) {
  // Marks when the app is interactive, so end-to-end tests don't act before hydration.
  useEffect(() => {
    document.documentElement.dataset.hydrated = "true";
  }, []);

  return (
    <ConfigProvider initial={config}>
      <MotionConfig reducedMotion="user">
        {children}
        <Pwa />
      </MotionConfig>
    </ConfigProvider>
  );
}
