"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/** A string kept in the URL query, so filtered views can be shared and survive reloads. */
export function useQueryState<T extends string = string>(key: string, fallback: T): [T, (v: T) => void] {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const value = (params.get(key) ?? fallback) as T;
  const set = useCallback(
    (v: T) => {
      const next = new URLSearchParams(params.toString());
      if (v === fallback || v === "") next.delete(key);
      else next.set(key, v);
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, router, pathname, key, fallback],
  );
  return [value, set];
}
