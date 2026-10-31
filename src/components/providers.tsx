"use client";

import { MotionConfig } from "framer-motion";
import { Pwa } from "./pwa";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      {children}
      <Pwa />
    </MotionConfig>
  );
}
