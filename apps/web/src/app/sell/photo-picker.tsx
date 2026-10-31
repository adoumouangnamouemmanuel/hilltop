"use client";

import { useState } from "react";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import { ImagePlus, Loader2, X } from "lucide-react";
import { compressImage } from "@/lib/images";
import { toast } from "@/lib/toast";
import { useConfig } from "@/lib/config";

/** Photo grid with upload (compressed in the browser), remove, and tap-to-make-cover. */
export function PhotoPicker({ value, onChange }: { value: string[]; onChange: (photos: string[]) => void }) {
  const MAX_PHOTOS = useConfig().listings.maxPhotos;
  const [busy, setBusy] = useState(false);

  async function onFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    const room = MAX_PHOTOS - value.length;
    if (files.length > room) toast(`Only ${MAX_PHOTOS} photos per listing. Added the first ${room}.`);
    setBusy(true);
    try {
      const urls = await Promise.all(files.slice(0, room).map((f) => compressImage(f)));
      onChange([...value, ...urls]);
    } catch {
      toast("Couldn't read one of those photos. Try a JPG or PNG.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 md:grid-cols-5">
      <AnimatePresence initial={false}>
        {value.map((src, i) => (
          <motion.div
            key={src.slice(-48) + i}
            layout
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="relative aspect-square overflow-hidden rounded-xl bg-surface"
          >
            <button
              type="button"
              onClick={() => onChange([value[i], ...value.filter((_, j) => j !== i)])}
              className="absolute inset-0"
              aria-label={i === 0 ? "Cover photo" : `Make photo ${i + 1} the cover`}
            >
              <Image src={src} alt={`Photo ${i + 1}`} fill sizes="160px" unoptimized={src.startsWith("data:")} className="object-cover" />
            </button>
            {i === 0 && (
              <span className="pointer-events-none absolute bottom-1.5 left-1.5 rounded-md bg-white px-1.5 py-0.5 text-[10px] font-semibold text-[#121010]">
                Cover
              </span>
            )}
            <button
              type="button"
              onClick={() => onChange(value.filter((_, j) => j !== i))}
              aria-label={`Remove photo ${i + 1}`}
              className="absolute top-1.5 right-1.5 grid size-6 place-items-center rounded-full bg-black/60 text-white hover:bg-black/80"
            >
              <X className="size-3.5" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
      {value.length < MAX_PHOTOS && (
        <label className="flex aspect-square flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-line-strong text-ink-500 transition-colors hover:border-ink-900 hover:text-ink-950">
          {busy ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <ImagePlus className="size-5" aria-hidden />}
          <span className="text-xs font-medium">{busy ? "Optimising" : "Add photos"}</span>
          <input type="file" accept="image/*" multiple onChange={onFiles} className="sr-only" disabled={busy} />
        </label>
      )}
    </div>
  );
}
