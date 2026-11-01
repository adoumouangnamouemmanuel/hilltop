"use client";

import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import { ImagePlus } from "lucide-react";
import type { CategoryDef } from "@/lib/catalog";
import { percent } from "@hilltop/shared/config";
import { useConfig } from "@/lib/config";
import { formatCedi } from "@/lib/format";
import type { ListingFormValues } from "@/lib/validation";
import { CategoryIcon } from "@/components/category-icon";

/** Live card preview plus what the seller will receive. */
export function Preview({ values, category }: { values: ListingFormValues; category: CategoryDef | null }) {
  const price = Number(values.price) || 0;
  const config = useConfig();
  const plan = config.boostPlans.find((p) => p.id === values.boost);
  const cover = values.photos[0];

  return (
    <>
      <div className="rounded-2xl border border-line p-4">
        <p className="mb-3 text-xs font-medium text-ink-500">Live preview</p>
        <div className="relative aspect-[4/5] overflow-hidden rounded-xl bg-surface">
          <AnimatePresence mode="wait">
            {cover ? (
              <motion.div
                key={cover.slice(-40)}
                className="absolute inset-0"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <Image src={cover} alt="" fill sizes="360px" unoptimized={cover.startsWith("data:")} className="object-cover" />
              </motion.div>
            ) : (
              <div className="grid h-full place-items-center text-ink-300">
                {category ? <CategoryIcon name={category.icon} className="size-10" /> : <ImagePlus className="size-8" aria-hidden />}
              </div>
            )}
          </AnimatePresence>
        </div>
        <div className="mt-3 space-y-0.5 px-0.5">
          <p className="text-[15px] font-semibold text-ink-950 tabular">{formatCedi(price)}</p>
          <p className="truncate text-[13px] text-ink-700">{values.title || "Your item title"}</p>
          <p className="truncate text-xs text-ink-500">
            {[values.condition, category?.label, values.pickup].filter(Boolean).join(" · ")}
            {values.boost !== "none" && " · Promoted"}
          </p>
        </div>
      </div>
      <dl className="mt-4 space-y-2 px-1 text-sm">
        <div className="flex justify-between text-ink-500">
          <dt>You receive{values.stock && Number(values.stock) > 1 ? " per item" : ""}</dt>
          <dd className="font-medium text-ink-950 tabular">{formatCedi(price)}</dd>
        </div>
        {plan && (
          <div className="flex justify-between text-ink-500">
            <dt>Promotion, {plan.label}</dt>
            <dd className="text-ink-950 tabular">{formatCedi(plan.price)}</dd>
          </div>
        )}
        <p className="text-xs leading-5 text-ink-500">
          {config.payments.inApp
            ? `The ${percent(config.fees.buyerProtectionRate)} buyer protection fee is paid by the buyer, not you.`
            : "Buyers reserve in the app and pay you directly when you meet."}
        </p>
      </dl>
    </>
  );
}
