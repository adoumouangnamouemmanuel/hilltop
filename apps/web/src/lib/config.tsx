"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { defaultConfig, parseConfig, type FeatureFlag, type PlatformConfig } from "@hilltop/shared/config";

/*
 * The platform config in the browser. The server passes the config it loaded;
 * the client then re-checks the published config when the tab regains focus, so
 * admin changes reach open tabs without a redeploy.
 */

const ConfigContext = createContext<PlatformConfig>(defaultConfig);

// Mirror for code outside React (the mock store), kept in sync by the provider.
let runtime: PlatformConfig = defaultConfig;
export const runtimeConfig = () => runtime;

const CONFIG_URL = process.env.NEXT_PUBLIC_CONFIG_URL;
const REFRESH_MS = 30_000;

export function ConfigProvider({ initial, children }: { initial: PlatformConfig; children: React.ReactNode }) {
  const [config, setConfig] = useState(initial);

  useEffect(() => {
    runtime = config;
  }, [config]);

  useEffect(() => {
    if (!CONFIG_URL) return;
    let last = 0;
    const refresh = async () => {
      if (Date.now() - last < REFRESH_MS) return;
      last = Date.now();
      try {
        const res = await fetch(CONFIG_URL, { cache: "no-store" });
        if (!res.ok) return;
        const { config: next, issues } = parseConfig(await res.json());
        if (!issues.length) setConfig((prev) => (next.version !== prev.version || next.publishedAt !== prev.publishedAt ? next : prev));
      } catch {}
    };
    refresh();
    const onVisible = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, []);

  return <ConfigContext.Provider value={config}>{children}</ConfigContext.Provider>;
}

export const useConfig = () => useContext(ConfigContext);

/** Whether a feature is switched on in the admin portal. */
export const useFeature = (flag: FeatureFlag) => useContext(ConfigContext).features[flag];
