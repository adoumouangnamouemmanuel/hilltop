"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { NotificationList, PushPrompt } from "@/components/notifications";
import { cn } from "@/components/ui";

export function NotificationsView() {
  const [tab, setTab] = useState<"all" | "unread">("all");
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-[-0.025em] text-ink-950 sm:text-3xl">Notifications</h1>
      <div className="mt-6">
        <PushPrompt />
      </div>
      <div className="mt-6 flex gap-6 border-b border-line" role="tablist">
        {(["all", "unread"] as const).map((t) => (
          <button
            key={t}
            role="tab"
            type="button"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={cn("relative pb-3 text-sm font-medium capitalize", tab === t ? "text-ink-950" : "text-ink-500 hover:text-ink-950")}
          >
            {t}
            {tab === t && <motion.span layoutId="notif-tab" className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-ink-950" />}
          </button>
        ))}
      </div>
      <div className="mt-4">
        <NotificationList unreadOnly={tab === "unread"} />
      </div>
    </>
  );
}
