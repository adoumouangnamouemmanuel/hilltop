"use client";

import { useEffect } from "react";
import Link from "next/link";
import { RotateCcw, TriangleAlert } from "lucide-react";
import { buttonClass } from "@/components/ui";

/** Shown when a page throws. Keeps the header and footer so the user can carry on. */
export default function Error({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    // Hook up an error reporting service (e.g. Sentry) here.
    console.error(error);
  }, [error]);

  return (
    <div className="container-page flex flex-col items-center py-24 text-center">
      <span className="grid size-14 place-items-center rounded-2xl bg-surface text-ink-950">
        <TriangleAlert className="size-6" aria-hidden />
      </span>
      <h1 className="mt-5 text-2xl font-semibold tracking-[-0.025em] text-ink-950">Something went wrong</h1>
      <p className="mt-2 max-w-sm text-sm text-ink-500">
        This page hit a problem. Your orders and payments are safe. Try again, or head back home.
      </p>
      <div className="mt-6 flex gap-2">
        <button type="button" onClick={() => retry()} className={buttonClass("dark", "md")}>
          <RotateCcw className="size-4" aria-hidden /> Try again
        </button>
        <Link href="/" className={buttonClass("outline", "md")}>
          Back to home
        </Link>
      </div>
    </div>
  );
}
