import Link from "next/link";

export function LogoMark({ size = 30 }: { size?: number }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden>
      <rect width="32" height="32" rx="8" className="fill-maroon-700" />
      <path d="M6 23.5 13.2 11l4.1 7.1 2.4-3.9L26 23.5H6Z" fill="white" />
    </svg>
  );
}

export function Logo() {
  return (
    <Link href="/" className="flex shrink-0 items-center gap-2" aria-label="Hilltop home">
      <LogoMark />
      <span className="text-[19px] font-semibold tracking-[-0.03em] text-ink-950">hilltop</span>
    </Link>
  );
}
