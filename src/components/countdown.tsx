"use client";

import { useEffect, useState } from "react";
import { cn } from "./ui";

function partsUntil(target: number) {
  const diff = Math.max(0, target - Date.now());
  return {
    days: Math.floor(diff / 86_400_000),
    hours: Math.floor((diff / 3_600_000) % 24),
    mins: Math.floor((diff / 60_000) % 60),
    secs: Math.floor((diff / 1000) % 60),
  };
}

const pad = (n?: number) => (n === undefined ? "--" : String(n).padStart(2, "0"));

export function Countdown({ to, variant = "blocks", className }: { to: string; variant?: "blocks" | "inline"; className?: string }) {
  const target = new Date(to).getTime();
  // Null until mounted so server and client markup match.
  const [parts, setParts] = useState<ReturnType<typeof partsUntil> | null>(null);

  useEffect(() => {
    const tick = () => setParts(partsUntil(target));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [target]);

  const units = [
    ["days", parts?.days],
    ["hours", parts?.hours],
    ["min", parts?.mins],
    ["sec", parts?.secs],
  ] as const;

  if (variant === "inline") {
    return (
      <span className={cn("tabular", className)} role="timer">
        {pad(parts?.days)}d {pad(parts?.hours)}h {pad(parts?.mins)}m {pad(parts?.secs)}s
      </span>
    );
  }

  return (
    <div className={cn("flex gap-2", className)} role="timer" aria-label="Time until the sale starts">
      {units.map(([label, value]) => (
        <div key={label} className="w-16 rounded-xl bg-white/10 py-2.5 text-center">
          <div className="text-2xl font-semibold tabular">{pad(value)}</div>
          <div className="text-[11px] text-white/60">{label}</div>
        </div>
      ))}
    </div>
  );
}
