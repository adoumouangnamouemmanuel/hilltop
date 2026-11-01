"use client";

import { useEffect } from "react";
import { MotionConfig } from "framer-motion";
import { Toaster } from "@hilltop/ui/toaster";
import { PublishedProvider } from "@/lib/store";

type Published = Parameters<typeof PublishedProvider>[0]["value"];

export function Providers({ published, children }: { published: Published; children: React.ReactNode }) {
  useEffect(() => {
    document.documentElement.dataset.hydrated = "true";
  }, []);
  return (
    <PublishedProvider value={published}>
      <MotionConfig reducedMotion="user">
        {children}
        <Toaster />
      </MotionConfig>
    </PublishedProvider>
  );
}
