"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Listing } from "@/lib/data";
import { ListingCard } from "./listing-card";
import { SectionHeader, cn } from "./ui";

/** A horizontally scrolling row of listings with arrow controls on desktop. */
export function ListingRail({
  title,
  subtitle,
  href,
  listings,
  action,
}: {
  title: string;
  subtitle?: string;
  href?: string;
  listings: Listing[];
  /** An extra control in the header, e.g. "Clear". */
  action?: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: true, end: false });

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setEdges({ start: el.scrollLeft < 4, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4 });
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [update]);

  const scroll = (dir: 1 | -1) => ref.current?.scrollBy({ left: dir * ref.current.clientWidth * 0.85, behavior: "smooth" });

  if (!listings.length) return null;

  return (
    <section>
      <SectionHeader title={title} subtitle={subtitle} href={href}>
        {action}
        <div className="hidden gap-1.5 md:flex">
          <ArrowButton disabled={edges.start} onClick={() => scroll(-1)} label="Scroll left">
            <ChevronLeft className="size-4" />
          </ArrowButton>
          <ArrowButton disabled={edges.end} onClick={() => scroll(1)} label="Scroll right">
            <ChevronRight className="size-4" />
          </ArrowButton>
        </div>
      </SectionHeader>
      <div
        ref={ref}
        onScroll={update}
        className="-mx-4 no-scrollbar flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 sm:-mx-6 sm:scroll-px-6 sm:px-6 lg:mx-0 lg:scroll-px-0 lg:gap-4 lg:px-0"
      >
        {listings.map((l) => (
          <div
            key={l.id}
            className="w-[44%] shrink-0 snap-start xs:w-[42%] sm:w-[30%] md:w-[23%] lg:w-[calc((100%-4rem)/5)] 3xl:w-[calc((100%-5rem)/6)]"
          >
            <ListingCard listing={l} sizes="(min-width: 1024px) 20vw, 45vw" />
          </div>
        ))}
      </div>
    </section>
  );
}

function ArrowButton({
  disabled,
  onClick,
  label,
  children,
}: {
  disabled: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={cn(
        "grid size-8 place-items-center rounded-full border border-line-strong text-ink-900 transition",
        disabled ? "cursor-default opacity-30" : "hover:border-ink-900",
      )}
    >
      {children}
    </button>
  );
}
