"use client";

import { useEffect } from "react";
import { MotionConfig } from "framer-motion";
import { Pwa } from "./pwa";

export function Providers({ children }: { children: React.ReactNode }) {
  // Marks when the app is interactive, so end-to-end tests don't act before hydration.
  useEffect(() => {
    document.documentElement.dataset.hydrated = "true";
  }, []);

  return (
    <MotionConfig reducedMotion="user">
      {children}
      <Pwa />
    </MotionConfig>
  );
}
