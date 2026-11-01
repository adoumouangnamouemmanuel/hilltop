"use client";

import { useEffect } from "react";
import { MotionConfig } from "framer-motion";
import { Toaster } from "@hilltop/ui/toaster";
import { PublishedProvider, SessionProvider } from "@/lib/session";

export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    document.documentElement.dataset.hydrated = "true";
  }, []);
  return (
    <SessionProvider>
      <PublishedProvider>
        <MotionConfig reducedMotion="user">
          {children}
          <Toaster />
        </MotionConfig>
      </PublishedProvider>
    </SessionProvider>
  );
}
