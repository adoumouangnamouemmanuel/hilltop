"use client";

import { useSyncExternalStore } from "react";

export type ToastTone = "default" | "success" | "saved";
export type Toast = { id: number; message: string; tone: ToastTone; action?: { label: string; href: string } };

let toasts: Toast[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function toast(message: string, opts: { tone?: ToastTone; action?: Toast["action"] } = {}) {
  const t: Toast = { id: nextId++, message, tone: opts.tone ?? "default", action: opts.action };
  toasts = [...toasts.slice(-2), t];
  emit();
  setTimeout(() => dismissToast(t.id), 3200);
}

export function dismissToast(id: number) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

const empty: Toast[] = [];

export function useToasts() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => toasts,
    () => empty,
  );
}
