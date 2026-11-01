"use client";

import { buttonClass } from "@hilltop/ui/ui";

export default function Error({ retry }: { error: unknown; retry: () => void }) {
  return (
    <div className="grid min-h-[60dvh] place-items-center px-6 text-center">
      <div>
        <h1 className="text-xl font-semibold tracking-[-0.02em] text-ink-950">Something went wrong</h1>
        <p className="mt-2 text-sm text-ink-500">The error was logged. Try again, and if it keeps happening, reload the page.</p>
        <button type="button" onClick={retry} className={buttonClass("dark", "md", "mt-6")}>
          Try again
        </button>
      </div>
    </div>
  );
}
