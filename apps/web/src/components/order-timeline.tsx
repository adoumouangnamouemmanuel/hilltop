import { Check } from "lucide-react";
import { cn } from "./ui";

import type { PaymentKind } from "@hilltop/shared/payments";

export const orderSteps: Record<PaymentKind, string[]> = {
  protected: ["Paid", "Held", "Collected", "Released"],
  deposit: ["Deposit", "Held", "Collected", "Released"],
  pickup: ["Reserved", "Ready", "Collected"],
};

/** Horizontal progress for an order. `reached` is how many steps are complete. */
export function OrderTimeline({ reached, kind = "protected" }: { reached: number; kind?: PaymentKind }) {
  const steps = orderSteps[kind];
  return (
    <ol className="flex items-start" aria-label="Order progress">
      {steps.map((step, i) => {
        const done = i < reached;
        const current = i === reached;
        return (
          <li key={step} className="flex flex-1 flex-col items-start last:flex-none">
            <div className="flex w-full items-center">
              <span
                className={cn(
                  "grid size-5 shrink-0 place-items-center rounded-full transition-colors duration-300",
                  done
                    ? "bg-ink-950 text-canvas"
                    : current
                      ? "border-2 border-ink-950 bg-elevated"
                      : "border-2 border-line-strong bg-elevated",
                )}
              >
                {done && <Check className="size-3" strokeWidth={3} aria-hidden />}
              </span>
              {i < steps.length - 1 && (
                <span className="mx-1.5 h-0.5 flex-1 overflow-hidden rounded-full bg-line">
                  <span
                    className="block h-full bg-ink-950 transition-[width] duration-500"
                    style={{ width: i < reached - 1 ? "100%" : "0%" }}
                  />
                </span>
              )}
            </div>
            <span className={cn("mt-1.5 text-[11px] font-medium", done || current ? "text-ink-950" : "text-ink-400")}>{step}</span>
          </li>
        );
      })}
    </ol>
  );
}
