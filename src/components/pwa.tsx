"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Share, X } from "lucide-react";
import { LogoMark } from "./logo";
import { buttonClass } from "./ui";

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

const DISMISS_KEY = "hilltop-install-dismissed";

const dismissedRecently = () => {
  try {
    return Date.now() - Number(localStorage.getItem(DISMISS_KEY) ?? 0) < 14 * 24 * 3_600_000;
  } catch {
    return false;
  }
};

/**
 * Registers the service worker and, on phones, offers to install Hilltop to the home screen.
 * Android/Chrome uses the native prompt; iOS gets Share > Add to Home Screen instructions.
 */
export function Pwa() {
  const [installEvent, setInstallEvent] = useState<InstallEvent | null>(null);
  const [mode, setMode] = useState<"native" | "ios" | null>(null);

  useEffect(() => {
    // In development a caching service worker gets in the way of hot reload.
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {});
    }

    const standalone = window.matchMedia("(display-mode: standalone)").matches;
    if (standalone || dismissedRecently()) return;

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as InstallEvent);
      setTimeout(() => setMode("native"), 12_000);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);

    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) && !("MSStream" in window);
    const timer = ios ? setTimeout(() => setMode("ios"), 20_000) : undefined;

    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      clearTimeout(timer);
    };
  }, []);

  function dismiss() {
    setMode(null);
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {}
  }

  async function install() {
    if (!installEvent) return;
    await installEvent.prompt();
    await installEvent.userChoice;
    setInstallEvent(null);
    dismiss();
  }

  return (
    <AnimatePresence>
      {mode && (
        <motion.div
          role="dialog"
          aria-label="Install Hilltop"
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 40 }}
          transition={{ type: "spring", stiffness: 400, damping: 36 }}
          className="fixed inset-x-3 bottom-24 z-50 rounded-2xl border border-line bg-elevated p-4 shadow-pop md:hidden"
        >
          <div className="flex items-start gap-3">
            <LogoMark size={44} />
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-ink-950">Get the Hilltop app</p>
              <p className="mt-0.5 text-[13px] leading-5 text-ink-500">
                {mode === "ios" ? (
                  <>
                    Tap <Share className="inline size-3.5 align-[-2px]" aria-label="Share" /> then &ldquo;Add to Home Screen&rdquo;.
                  </>
                ) : (
                  "Faster, full screen, and alerts when sellers reply."
                )}
              </p>
            </div>
            <button
              type="button"
              onClick={dismiss}
              className="grid size-8 place-items-center rounded-full text-ink-500 hover:bg-surface"
              aria-label="Not now"
            >
              <X className="size-4" />
            </button>
          </div>
          {mode === "native" && (
            <button type="button" onClick={install} className={buttonClass("dark", "md", "mt-3 w-full")}>
              Install
            </button>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
