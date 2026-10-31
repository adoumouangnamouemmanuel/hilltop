"use client";

import { useState } from "react";
import Image, { type ImageProps } from "next/image";
import { ImageOff } from "lucide-react";
import { cn } from "./ui";

/** next/image that shows a neutral placeholder instead of a broken image if loading fails. */
export function SafeImage({ className, alt, ...props }: ImageProps) {
  const [failed, setFailed] = useState(false);
  const [lastSrc, setLastSrc] = useState(props.src);
  if (lastSrc !== props.src) {
    setLastSrc(props.src);
    setFailed(false);
  }

  if (failed) {
    return (
      <span
        role="img"
        aria-label={alt || "Image unavailable"}
        className={cn("absolute inset-0 grid place-items-center bg-surface text-ink-300", className)}
      >
        <ImageOff className="size-6" aria-hidden />
      </span>
    );
  }
  return <Image {...props} alt={alt} className={className} onError={() => setFailed(true)} />;
}
