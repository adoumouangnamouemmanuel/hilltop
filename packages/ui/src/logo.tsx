import Link from "next/link";

/** The Hilltop mark: a lowercase h whose arch is the hill, with the sun rising behind it. */
export function LogoMark({ size = 30 }: { size?: number }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden>
      <rect width="64" height="64" rx="16" className="fill-maroon-700" />
      <circle cx="45.5" cy="18.5" r="6.5" fill="#F5B841" />
      <path
        d="M21 13v37M21 37c0-8 5.4-13 12-13s12 5 12 13v13"
        fill="none"
        stroke="#fff"
        strokeWidth="8.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
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
