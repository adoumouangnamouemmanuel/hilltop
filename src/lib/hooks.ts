"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type RefObject } from "react";
import { usePathname } from "next/navigation";

/** Stops the page behind a popup from scrolling. Nested locks are counted. */
let locks = 0;
export function useBodyScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    locks++;
    document.body.style.overflow = "hidden";
    return () => {
      locks--;
      if (!locks) document.body.style.overflow = "";
    };
  }, [active]);
}

/** Calls `onOutside` for pointer presses outside the element, and on Escape. */
export function useDismiss(ref: RefObject<HTMLElement | null>, active: boolean, onDismiss: () => void) {
  const cb = useRef(onDismiss);
  useEffect(() => {
    cb.current = onDismiss;
  });
  useEffect(() => {
    if (!active) return;
    const onDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && cb.current();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && cb.current();
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [active, ref]);
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Keeps keyboard focus inside a dialog while it's open, focuses the first control,
 * and returns focus to whatever was focused before when it closes.
 */
export function useFocusTrap(ref: RefObject<HTMLElement | null>, active: boolean) {
  useEffect(() => {
    if (!active) return;
    const previous = document.activeElement as HTMLElement | null;
    const el = ref.current;
    const items = () => (el ? Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((n) => n.offsetParent !== null) : []);
    // Wait a frame so entering animations have mounted their content.
    const id = requestAnimationFrame(() => {
      if (el && !el.contains(document.activeElement)) (el.querySelector<HTMLElement>("[autofocus]") ?? items()[0] ?? el).focus();
    });
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const list = items();
      if (!list.length) return;
      const first = list[0];
      const last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(id);
      document.removeEventListener("keydown", onKey);
      previous?.focus?.();
    };
  }, [active, ref]);
}

/** Runs `fn` whenever the route changes, e.g. to close menus. */
export function useOnNavigate(fn: () => void) {
  const pathname = usePathname();
  const [last, setLast] = useState(pathname);
  if (last !== pathname) {
    setLast(pathname);
    fn();
  }
}

// A shared clock, so relative times ("5 min ago") tick without each component owning a timer.
let now = 0;
const clockListeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

function subscribeClock(cb: () => void) {
  clockListeners.add(cb);
  if (!timer) {
    now = Date.now();
    timer = setInterval(() => {
      now = Date.now();
      clockListeners.forEach((l) => l());
    }, 30_000);
  }
  return () => {
    clockListeners.delete(cb);
    if (!clockListeners.size && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

/** Current time in the browser, null during server render so markup always matches. */
export function useNow(): number | null {
  return useSyncExternalStore(
    subscribeClock,
    () => now || (now = Date.now()),
    () => null,
  );
}

/** Calls back when the element scrolls into view, for infinite scrolling. */
export function useInView(ref: RefObject<Element | null>, onEnter: () => void, enabled = true) {
  const cb = useRef(onEnter);
  useEffect(() => {
    cb.current = onEnter;
  });
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && cb.current(), { rootMargin: "600px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [ref, enabled]);
}
