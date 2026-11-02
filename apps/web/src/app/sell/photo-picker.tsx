"use client";

import { useState } from "react";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import { ImagePlus, Loader2, X } from "lucide-react";
import { compressImage } from "@/lib/images";
import { toast } from "@/lib/toast";
import { useConfig } from "@/lib/config";

/** Photo grid with upload (compressed in the browser), remove, and tap-to-make-cover. */
export function PhotoPicker({
  value,
  onChange,
  onBusyChange,
}: {
  value: string[];
  onChange: (photos: string[]) => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const MAX_PHOTOS = useConfig().listings.maxPhotos;
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  async function onFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    const room = MAX_PHOTOS - value.length;
    if (files.length > room) toast(`Only ${MAX_PHOTOS} photos per listing. Added the first ${room}.`);
    setBusy(true);
    onBusyChange?.(true);
    setErrors([]);
    try {
      const urls: string[] = [];
      const failures: string[] = [];
      // Decode sequentially to avoid holding several full-size camera photos in memory.
      for (const file of files.slice(0, room)) {
        try {
          urls.push(await compressImage(file));
        } catch (error) {
          failures.push(`${file.name}: ${error instanceof Error ? error.message : "Couldn't read this photo. Try a JPEG or PNG."}`);
        }
      }
      onChange([...value, ...urls]);
      setErrors(failures);
    } finally {
      setBusy(false);
      onBusyChange?.(false);
    }
  }

  return (
    <div>
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
                disabled={busy}
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
                disabled={busy}
                onClick={() => onChange(value.filter((_, j) => j !== i))}
                aria-label={`Remove photo ${i + 1}`}
                className="absolute top-1 right-1 grid size-11 place-items-center rounded-full bg-black/60 text-white hover:bg-black/80"
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
            <input type="file" accept="image/*,.heic,.heif" multiple onChange={onFiles} className="sr-only" disabled={busy} />
          </label>
        )}
      </div>
      <p className="mt-2 text-xs text-ink-500">
        JPEG, PNG, WebP and HEIC. Up to 25 MB per photo. HEIC photos are converted on your device.
      </p>
      {errors.length > 0 && (
        <ul role="alert" className="mt-3 space-y-1 text-sm text-warning">
          {errors.map((error, i) => (
            <li key={i}>{error}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
