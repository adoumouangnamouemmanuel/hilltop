"use client";

import { useState } from "react";
import { Flag } from "lucide-react";
import { useConfig } from "@/lib/config";
import { hasReported } from "@/lib/model";
import { useStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import { Sheet } from "@/components/sheet";
import { buttonClass, cn } from "@/components/ui";

/** "Report this listing" link and sheet. Reasons come from the admin's settings. */
export function ReportListing({ listingId, title }: { listingId: string; title: string }) {
  const { reports } = useConfig();
  const store = useStore();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string | null>(null);
  const [details, setDetails] = useState("");

  if (!reports.enabled) return null;
  if (hasReported(store, listingId))
    return (
      <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-ink-500">
        <Flag className="size-3.5" aria-hidden /> You reported this listing. The Hilltop team will review it.
      </p>
    );

  function submit() {
    if (!reason) return;
    store.reportListing(listingId, reason, details.trim());
    setOpen(false);
    toast("Thanks for reporting. The Hilltop team will review it.", { tone: "success" });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => (store.user ? setOpen(true) : toast("Log in to report a listing"))}
        className="mx-auto mt-4 flex items-center gap-1.5 text-xs text-ink-500 underline-offset-4 hover:text-ink-950 hover:underline"
      >
        <Flag className="size-3.5" aria-hidden /> Report this listing
      </button>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="Report this listing"
        footer={
          <button type="button" onClick={submit} disabled={!reason} className={buttonClass("dark", "lg", "w-full")}>
            Send report
          </button>
        }
      >
        <p className="text-sm text-ink-500">
          What&rsquo;s wrong with &ldquo;{title}&rdquo;? Reports are private; the seller isn&rsquo;t told who sent them.
        </p>
        <div className="mt-4 space-y-2" role="radiogroup" aria-label="Reason">
          {reports.reasons.map((r) => (
            <button
              key={r.id}
              type="button"
              role="radio"
              aria-checked={reason === r.id}
              onClick={() => setReason(r.id)}
              className={cn(
                "flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left text-sm transition-colors",
                reason === r.id ? "border-ink-950 bg-surface text-ink-950" : "border-line text-ink-700 hover:border-line-strong",
              )}
            >
              {r.label}
              <span
                className={cn(
                  "grid size-4 place-items-center rounded-full border-2",
                  reason === r.id ? "border-ink-950" : "border-line-strong",
                )}
              >
                {reason === r.id && <span className="size-2 rounded-full bg-ink-950" />}
              </span>
            </button>
          ))}
        </div>
        <label className="mt-4 block text-sm font-medium text-ink-900" htmlFor="report-details">
          Anything else? <span className="font-normal text-ink-500">(optional)</span>
        </label>
        <textarea
          id="report-details"
          value={details}
          onChange={(e) => setDetails(e.target.value.slice(0, 500))}
          rows={3}
          className="mt-1.5 w-full resize-none rounded-xl border border-line-strong bg-elevated px-3.5 py-2.5 text-sm text-ink-950 focus:border-ink-900 focus:outline-none"
        />
      </Sheet>
    </>
  );
}
