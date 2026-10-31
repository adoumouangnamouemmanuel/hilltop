import Link from "next/link";
import clsx from "clsx";
import { BadgeCheck, Star } from "lucide-react";
import { initials } from "@/lib/format";

export { clsx as cn };

type Variant = "primary" | "dark" | "outline" | "ghost" | "white" | "glass";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary: "bg-maroon-700 text-white hover:bg-maroon-800 disabled:bg-ink-300",
  dark: "bg-ink-950 text-canvas hover:bg-ink-700 disabled:bg-ink-300",
  outline: "bg-elevated text-ink-900 border border-line-strong hover:border-ink-900 disabled:text-ink-400",
  ghost: "text-ink-700 hover:bg-surface hover:text-ink-900",
  white: "bg-white text-[#121010] hover:bg-white/90",
  glass: "bg-white/10 text-white hover:bg-white/15",
};

const sizes: Record<Size, string> = {
  sm: "h-9 px-3.5 text-[13px] rounded-lg",
  md: "h-11 px-5 text-sm rounded-xl",
  lg: "h-12 px-6 text-[15px] rounded-xl",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md", className?: string) {
  return clsx(
    "inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 font-medium transition-[color,background-color,border-color,transform] duration-150 select-none active:scale-[0.97] disabled:cursor-not-allowed disabled:active:scale-100",
    variants[variant],
    sizes[size],
    className,
  );
}

export function ButtonLink({
  href,
  variant = "primary",
  size = "md",
  className,
  children,
}: {
  href: string;
  variant?: Variant;
  size?: Size;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Link href={href} className={buttonClass(variant, size, className)}>
      {children}
    </Link>
  );
}

export function Verified({ className, label = false }: { className?: string; label?: boolean }) {
  return (
    <span className={clsx("inline-flex items-center gap-1 text-maroon-700", className)} title="Verified Ashesi student">
      <BadgeCheck className="size-4 shrink-0" strokeWidth={2} aria-hidden />
      {label ? <span className="text-xs font-medium">Verified student</span> : <span className="sr-only">Verified Ashesi student</span>}
    </span>
  );
}

export function Rating({ value, count, className }: { value: number; count?: number; className?: string }) {
  return (
    <span className={clsx("inline-flex items-center gap-1 tabular", className)}>
      <Star className="size-3.5 fill-ink-900 text-ink-900" aria-hidden />
      <span className="font-medium text-ink-900">{value.toFixed(1)}</span>
      {count !== undefined && <span className="text-ink-500">({count})</span>}
    </span>
  );
}

const avatarTones = ["bg-maroon-100 text-maroon-700", "bg-surface-2 text-ink-900", "bg-[#e7efe9] text-[#24563b] dark:bg-[#15291f] dark:text-[#8fd3ae]", "bg-[#e9ecf5] text-[#2c3d6b] dark:bg-[#18203a] dark:text-[#a9b8ea]", "bg-[#f6ecdf] text-[#7a4a12] dark:bg-[#2c2113] dark:text-[#e6b97a]"];

export function Avatar({ name, size = 40, className }: { name: string; size?: number; className?: string }) {
  const tone = avatarTones[[...name].reduce((n, c) => n + c.charCodeAt(0), 0) % avatarTones.length];
  return (
    <span
      aria-hidden
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}
      className={clsx("inline-grid shrink-0 place-items-center rounded-full font-semibold", tone, className)}
    >
      {initials(name)}
    </span>
  );
}

export function Chip({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={clsx("inline-flex items-center gap-1.5 rounded-md bg-surface px-2 py-1 text-xs font-medium text-ink-700", className)}>
      {children}
    </span>
  );
}

export function SectionHeader({
  title,
  subtitle,
  href,
  linkLabel = "View all",
  children,
}: {
  title: string;
  subtitle?: string;
  href?: string;
  linkLabel?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex items-end justify-between gap-4">
      <div className="min-w-0">
        <h2 className="text-xl font-semibold tracking-[-0.02em] text-ink-950 sm:text-2xl">{title}</h2>
        {subtitle && <p className="mt-1 text-sm text-ink-500">{subtitle}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {href && (
          <Link href={href} className="text-sm font-medium text-ink-900 underline decoration-line-strong underline-offset-4 transition-colors hover:decoration-ink-900">
            {linkLabel}
          </Link>
        )}
        {children}
      </div>
    </div>
  );
}
