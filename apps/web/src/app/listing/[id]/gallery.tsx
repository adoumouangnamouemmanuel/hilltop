"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Expand, ScanSearch, X, ZoomIn, ZoomOut } from "lucide-react";
import { useBodyScrollLock, useFocusTrap } from "@/lib/hooks";
import { SafeImage } from "@/components/safe-image";
import { cn } from "@/components/ui";

const LENS = 200;

export function Gallery({ images, title }: { images: string[]; title: string }) {
  const [index, setIndex] = useState(0);
  const [lightbox, setLightbox] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const many = images.length > 1;

  const go = (i: number) => setIndex((i + images.length) % images.length);

  // Mobile: keep the dots in sync with the swipe position.
  function onScroll() {
    const el = scroller.current;
    if (el) setIndex(Math.round(el.scrollLeft / el.clientWidth));
  }

  return (
    <>
      {/* Mobile swipe carousel */}
      <div className="relative -mx-4 sm:mx-0 md:hidden">
        <div ref={scroller} onScroll={onScroll} className="no-scrollbar flex snap-x snap-mandatory overflow-x-auto sm:rounded-2xl">
          {images.map((src, i) => (
            <button
              key={src}
              type="button"
              onClick={() => setLightbox(true)}
              className="relative aspect-square w-full shrink-0 snap-center bg-surface"
              aria-label={`Open photo ${i + 1}`}
            >
              <Image src={src} alt={i === 0 ? title : ""} fill priority={i === 0} sizes="100vw" className="object-cover" />
            </button>
          ))}
        </div>
        {many && (
          <div className="absolute inset-x-0 bottom-3 flex justify-center gap-1.5">
            {images.map((src, i) => (
              <motion.span
                key={src}
                animate={{ width: i === index ? 16 : 6, opacity: i === index ? 1 : 0.6 }}
                className="h-1.5 rounded-full bg-white shadow"
              />
            ))}
          </div>
        )}
        <span className="absolute right-4 bottom-3 flex items-center gap-1 rounded-full bg-black/50 px-2 py-1 text-[11px] text-white backdrop-blur">
          <ZoomIn className="size-3" aria-hidden /> Tap to zoom
        </span>
      </div>

      {/* Desktop */}
      {/* Capped so photos (stored up to 1600px) stay sharp and the page doesn't scroll past them. */}
      <div className={cn("hidden max-w-[600px] gap-3 md:grid", many && "grid-cols-[72px_1fr]")}>
        {many && (
          <div className="flex flex-col gap-2">
            {images.map((src, i) => (
              <button
                key={src}
                type="button"
                onMouseEnter={() => setIndex(i)}
                onClick={() => setIndex(i)}
                aria-label={`Show photo ${i + 1}`}
                className={cn(
                  "relative aspect-square overflow-hidden rounded-lg bg-surface transition",
                  i === index ? "ring-2 ring-ink-950 ring-offset-2 ring-offset-canvas" : "opacity-60 hover:opacity-100",
                )}
              >
                <Image src={src} alt="" fill sizes="72px" className="object-cover" />
              </button>
            ))}
          </div>
        )}
        <LensViewer
          images={images}
          index={index}
          title={title}
          onOpen={() => setLightbox(true)}
          onPrev={many ? () => go(index - 1) : undefined}
          onNext={many ? () => go(index + 1) : undefined}
        />
      </div>

      <Lightbox open={lightbox} onClose={() => setLightbox(false)} images={images} index={index} setIndex={go} title={title} />
    </>
  );
}

/** Main image with a magnifying lens that follows the cursor. Scroll to change the zoom. */
function LensViewer({
  images,
  index,
  title,
  onOpen,
  onPrev,
  onNext,
}: {
  images: string[];
  index: number;
  title: string;
  onOpen: () => void;
  onPrev?: () => void;
  onNext?: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [lensOn, setLensOn] = useState(true);
  const [zoom, setZoom] = useState(2.5);
  const [pos, setPos] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  // Wheel needs a non-passive listener to stop the page scrolling while zooming.
  useEffect(() => {
    const el = box.current;
    if (!el || !lensOn) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setZoom((z) => Math.min(5, Math.max(1.5, z - e.deltaY * 0.004)));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [lensOn]);

  function onMove(e: React.MouseEvent) {
    const r = box.current!.getBoundingClientRect();
    setPos({ x: e.clientX - r.left, y: e.clientY - r.top, w: r.width, h: r.height });
  }

  const showLens = lensOn && pos;

  return (
    <div
      ref={box}
      onMouseMove={lensOn ? onMove : undefined}
      onMouseLeave={() => setPos(null)}
      className={cn("group relative aspect-square overflow-hidden rounded-2xl bg-surface", showLens && "cursor-none")}
    >
      {/* All photos stay mounted so switching is instant once loaded. */}
      {images.map((src, i) => (
        <SafeImage
          key={src}
          src={src}
          alt={i === index ? title : ""}
          fill
          priority={i === 0}
          loading={i === 0 ? undefined : "eager"}
          sizes="(min-width: 768px) 520px, 90vw"
          className={cn("object-cover transition-opacity duration-300", i === index ? "opacity-100" : "opacity-0")}
        />
      ))}

      <AnimatePresence>
        {showLens && (
          <motion.div
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.6 }}
            transition={{ duration: 0.15 }}
            className="pointer-events-none absolute z-10 overflow-hidden rounded-full border-2 border-white shadow-[0_8px_30px_rgb(0_0_0/0.35)]"
            style={{ width: LENS, height: LENS, left: pos.x - LENS / 2, top: pos.y - LENS / 2 }}
            aria-hidden
          >
            {/* A scaled copy of the image, offset so the point under the cursor sits in the lens centre. */}
            <div
              className="absolute"
              style={{
                width: pos.w * zoom,
                height: pos.h * zoom,
                left: -(pos.x * zoom - LENS / 2),
                top: -(pos.y * zoom - LENS / 2),
              }}
            >
              <Image src={images[index]} alt="" fill sizes="2000px" quality={90} className="object-cover" />
            </div>
            <span className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/55 px-1.5 py-0.5 text-[10px] font-semibold text-white tabular">
              {zoom.toFixed(1)}x
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="absolute right-4 bottom-4 z-20 flex gap-2 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        <button
          type="button"
          onClick={() => setLensOn((v) => !v)}
          aria-pressed={lensOn}
          className={cn(
            "flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium shadow-sm",
            lensOn ? "bg-ink-950 text-canvas" : "bg-elevated/95 text-ink-950",
          )}
        >
          <ScanSearch className="size-3.5" aria-hidden /> Lens {lensOn ? "on" : "off"}
        </button>
        <button
          type="button"
          onClick={onOpen}
          className="flex cursor-pointer items-center gap-1.5 rounded-lg bg-elevated/95 px-3 py-2 text-xs font-medium text-ink-950 shadow-sm"
        >
          <Expand className="size-3.5" aria-hidden /> Full screen
        </button>
      </div>
      {lensOn && !pos && (
        <span className="pointer-events-none absolute top-4 left-4 z-20 rounded-lg bg-elevated/90 px-2.5 py-1.5 text-[11px] font-medium text-ink-700 opacity-0 transition-opacity group-hover:opacity-100">
          Hover to magnify, scroll to zoom
        </span>
      )}
      {onPrev && <NavButton side="left" onClick={onPrev} />}
      {onNext && <NavButton side="right" onClick={onNext} />}
    </div>
  );
}

function NavButton({ side, onClick }: { side: "left" | "right"; onClick: () => void }) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={side === "left" ? "Previous photo" : "Next photo"}
      className={cn(
        "absolute top-1/2 z-20 grid size-10 -translate-y-1/2 cursor-pointer place-items-center rounded-full bg-elevated/95 text-ink-950 opacity-0 shadow-sm transition-opacity group-hover:opacity-100 focus-visible:opacity-100",
        side === "left" ? "left-4" : "right-4",
      )}
    >
      <Icon className="size-5" />
    </button>
  );
}

/** Full-screen viewer: double-tap or click to zoom, drag to pan, swipe to change photo. */
function Lightbox({
  open,
  onClose,
  images,
  index,
  setIndex,
  title,
}: {
  open: boolean;
  onClose: () => void;
  images: string[];
  index: number;
  setIndex: (i: number) => void;
  title: string;
}) {
  const [zoomed, setZoomed] = useState(false);
  const [origin, setOrigin] = useState("50% 50%");
  const lastTap = useRef(0);
  const dialog = useRef<HTMLDivElement>(null);
  useBodyScrollLock(open);
  useFocusTrap(dialog, open);

  // Reset zoom whenever the photo changes.
  const [lastIndex, setLastIndex] = useState(index);
  if (lastIndex !== index) {
    setLastIndex(index);
    setZoomed(false);
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") setIndex(index + 1);
      if (e.key === "ArrowLeft") setIndex(index - 1);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose, index, setIndex]);

  function toggleZoom(e: React.MouseEvent) {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setOrigin(`${((e.clientX - r.left) / r.width) * 100}% ${((e.clientY - r.top) / r.height) * 100}%`);
    setZoomed((z) => !z);
  }

  function onTap(e: React.MouseEvent) {
    // Desktop: single click zooms. Touch: double tap zooms.
    const now = Date.now();
    if (window.matchMedia("(hover: hover)").matches || now - lastTap.current < 300) toggleZoom(e);
    lastTap.current = now;
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={dialog}
          role="dialog"
          aria-modal="true"
          aria-label={`${title} photos`}
          tabIndex={-1}
          className="fixed inset-0 z-[80] flex flex-col bg-[#0a0909]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="flex items-center justify-between p-4 text-sm text-white/70">
            <span className="tabular">
              {index + 1} / {images.length}
            </span>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => setZoomed((z) => !z)}
                className="grid size-10 cursor-pointer place-items-center rounded-full text-white hover:bg-white/10"
                aria-label={zoomed ? "Zoom out" : "Zoom in"}
              >
                {zoomed ? <ZoomOut className="size-5" /> : <ZoomIn className="size-5" />}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="grid size-10 cursor-pointer place-items-center rounded-full text-white hover:bg-white/10"
                aria-label="Close"
              >
                <X className="size-5" />
              </button>
            </div>
          </div>

          <div className="relative flex-1 overflow-hidden">
            <AnimatePresence initial={false} mode="popLayout">
              <motion.div
                key={index}
                className="absolute inset-0"
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ duration: 0.25 }}
                drag={zoomed ? true : images.length > 1 ? "x" : false}
                dragConstraints={zoomed ? { left: -300, right: 300, top: -300, bottom: 300 } : { left: 0, right: 0 }}
                dragElastic={zoomed ? 0.1 : 0.4}
                onDragEnd={(_, info) => {
                  if (zoomed) return;
                  if (info.offset.x < -80) setIndex(index + 1);
                  else if (info.offset.x > 80) setIndex(index - 1);
                }}
                onClick={onTap}
              >
                <motion.div
                  className={cn("relative size-full", zoomed ? "cursor-zoom-out" : "cursor-zoom-in")}
                  animate={{ scale: zoomed ? 2.5 : 1 }}
                  style={{ transformOrigin: origin }}
                  transition={{ type: "spring", stiffness: 260, damping: 30 }}
                >
                  <Image
                    src={images[index]}
                    alt={title}
                    fill
                    sizes="100vw"
                    quality={90}
                    className="pointer-events-none object-contain select-none"
                    draggable={false}
                  />
                </motion.div>
              </motion.div>
            </AnimatePresence>
            {images.length > 1 && !zoomed && (
              <>
                <button
                  type="button"
                  onClick={() => setIndex(index - 1)}
                  className="absolute top-1/2 left-4 hidden size-12 -translate-y-1/2 cursor-pointer place-items-center rounded-full bg-white/10 text-white hover:bg-white/20 md:grid"
                  aria-label="Previous photo"
                >
                  <ChevronLeft className="size-6" />
                </button>
                <button
                  type="button"
                  onClick={() => setIndex(index + 1)}
                  className="absolute top-1/2 right-4 hidden size-12 -translate-y-1/2 cursor-pointer place-items-center rounded-full bg-white/10 text-white hover:bg-white/20 md:grid"
                  aria-label="Next photo"
                >
                  <ChevronRight className="size-6" />
                </button>
              </>
            )}
          </div>

          <div className="flex items-center justify-center gap-2 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {images.length > 1 &&
              images.map((src, i) => (
                <button
                  key={src}
                  type="button"
                  onClick={() => setIndex(i)}
                  aria-label={`Photo ${i + 1}`}
                  className={cn(
                    "relative size-12 cursor-pointer overflow-hidden rounded-lg transition",
                    i === index ? "ring-2 ring-white" : "opacity-50 hover:opacity-100",
                  )}
                >
                  <Image src={src} alt="" fill sizes="48px" className="object-cover" />
                </button>
              ))}
            {images.length === 1 && <p className="text-xs text-white/50">{zoomed ? "Drag to look around" : "Tap twice to zoom"}</p>}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
