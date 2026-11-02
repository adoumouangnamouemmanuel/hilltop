"use client";

import { useEffect, useState } from "react";
import type { Seller } from "./data";
import { fetchSeller } from "./market";

/**
 * A seller's profile as it is now. Pages start from the cached copy, then read the
 * profile fresh so a new shop name or reply time shows straight after it's saved.
 */
export function useLiveSeller<T extends Seller>(seller: T): T {
  const [fresh, setFresh] = useState<Seller | null>(null);
  const handle = seller.id;
  useEffect(() => {
    let live = true;
    fetchSeller(handle, { cache: "no-store" })
      .then((s) => live && setFresh(s))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [handle]);
  return fresh?.id === handle ? { ...seller, ...fresh } : seller;
}
