"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  ChartNoAxesColumn,
  ChevronDown,
  Heart,
  LayoutGrid,
  LogOut,
  MessageCircle,
  Package,
  Plus,
  Search,
  Store,
} from "lucide-react";
import { getListing } from "@/lib/data";
import { useDismiss, useOnNavigate } from "@/lib/hooks";
import { dateRange } from "@hilltop/shared/config";
import { useConfig } from "@/lib/config";
import { useStore } from "@/lib/store";
import { useCatalog } from "@/lib/use-catalog";
import { CategoryIcon } from "./category-icon";
import { Logo } from "./logo";
import { NotificationBell } from "./notifications";
import { SearchBox } from "./search-box";
import { ThemeSegmented, ThemeToggle } from "./theme-toggle";
import { Avatar, buttonClass, cn } from "./ui";

export function Header() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [megaOpen, setMegaOpen] = useState(false);
  const megaTrigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let last = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      setScrolled(y > 4);
      // On phones, tuck the header away while scrolling down and bring it back on the way up.
      if (window.matchMedia("(max-width: 767px)").matches) {
        if (y > last + 8 && y > 160) setHidden(true);
        else if (y < last - 8 || y < 80) setHidden(false);
      } else setHidden(false);
      last = y;
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useOnNavigate(() => {
    setMegaOpen(false);
    setHidden(false);
  });

  // Auth screens are focused pages with their own minimal chrome.
  if (pathname.startsWith("/sign")) return null;

  function closeMega(returnFocus = false) {
    setMegaOpen(false);
    if (returnFocus) megaTrigger.current?.focus();
  }

  return (
    <motion.header
      animate={{ y: hidden ? "-100%" : 0 }}
      transition={{ type: "spring", stiffness: 400, damping: 40 }}
      className={cn("sticky top-0 z-40 bg-canvas/85 backdrop-blur-xl transition-shadow", scrolled && "shadow-[0_1px_0_var(--line)]")}
      onMouseLeave={() => setMegaOpen(false)}
    >
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-ink-950 focus:px-3 focus:py-2 focus:text-canvas"
      >
        Skip to content
      </a>
      <div className="container-page flex h-16 items-center gap-3 lg:gap-6">
        <Logo />
        <button
          ref={megaTrigger}
          type="button"
          onClick={() => setMegaOpen((o) => !o)}
          onMouseEnter={() => setMegaOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setMegaOpen(true);
              requestAnimationFrame(() => document.querySelector<HTMLElement>("#mega-menu a")?.focus());
            }
          }}
          aria-expanded={megaOpen}
          aria-controls="mega-menu"
          className={cn(
            "hidden h-10 items-center gap-1.5 rounded-xl px-3 text-sm font-medium transition-colors lg:flex",
            megaOpen ? "bg-surface text-ink-950" : "text-ink-700 hover:bg-surface hover:text-ink-950",
          )}
        >
          <LayoutGrid className="size-4" aria-hidden /> Categories
          <ChevronDown className={cn("size-3.5 transition-transform", megaOpen && "rotate-180")} aria-hidden />
        </button>
        <Suspense fallback={<SearchFallback className="hidden flex-1 md:flex" />}>
          <SearchBox className="hidden max-w-2xl flex-1 md:block" shortcut />
        </Suspense>
        <div className="ml-auto flex items-center gap-1">
          <ThemeToggle />
          <HeaderActions />
        </div>
      </div>

      {/* The home hero has its own big search on phones. */}
      {pathname !== "/" && (
        <div className="container-page pb-2.5 md:hidden">
          <Suspense fallback={<SearchFallback />}>
            <SearchBox />
          </Suspense>
        </div>
      )}

      <Suspense fallback={<div className="h-11 border-b border-line" />}>
        <CategoryNav />
      </Suspense>

      <AnimatePresence>{megaOpen && <MegaMenu onClose={closeMega} />}</AnimatePresence>
    </motion.header>
  );
}

function SearchFallback({ className }: { className?: string }) {
  return (
    <div className={cn("flex h-11 items-center gap-2.5 rounded-xl bg-surface px-3.5 text-sm text-ink-400", className)}>
      <Search className="size-[18px]" aria-hidden /> Search phones, books, calculators...
    </div>
  );
}

/** Moves focus between links in a CSS grid with the arrow keys. */
function onGridKeys(e: React.KeyboardEvent<HTMLElement>, onEscape: () => void) {
  if (e.key === "Escape") return onEscape();
  const keys: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 0, ArrowUp: 0 };
  if (!(e.key in keys)) return;
  const grid = e.currentTarget;
  const links = Array.from(grid.querySelectorAll<HTMLElement>("a"));
  const i = links.indexOf(document.activeElement as HTMLElement);
  if (i < 0) return;
  const cols = getComputedStyle(grid).gridTemplateColumns.split(" ").length;
  const step = e.key === "ArrowDown" ? cols : e.key === "ArrowUp" ? -cols : keys[e.key];
  const next = links[i + step];
  if (next) {
    e.preventDefault();
    next.focus();
  }
}

function MegaMenu({ onClose }: { onClose: (returnFocus?: boolean) => void }) {
  const { categories, counts } = useCatalog();
  const sale = useConfig().events.moveOut;
  const feature = getListing("study-table")!;
  return (
    <motion.div
      id="mega-menu"
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.18 }}
      className="absolute inset-x-0 top-16 z-50 hidden border-y border-line bg-elevated shadow-pop lg:block"
    >
      <div className="container-page grid grid-cols-[1fr_280px] gap-10 py-8">
        <nav
          aria-label="All categories"
          className="grid grid-cols-3 gap-1 xl:grid-cols-4"
          onKeyDown={(e) => onGridKeys(e, () => onClose(true))}
        >
          {categories.map((c, i) => (
            <motion.div key={c.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.015 }}>
              <Link
                href={`/browse?category=${c.id}`}
                onClick={() => onClose()}
                className="group flex items-start gap-3 rounded-xl p-3 transition-colors hover:bg-surface focus-visible:bg-surface"
              >
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface text-ink-950 transition-colors group-hover:bg-ink-950 group-hover:text-canvas">
                  <CategoryIcon name={c.icon} className="size-[18px]" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-ink-950">{c.label}</span>
                  <span className="block truncate text-xs text-ink-500">{counts[c.id] ? `${counts[c.id]} items` : c.blurb}</span>
                </span>
              </Link>
            </motion.div>
          ))}
        </nav>
        {sale.enabled && (
          <Link
            href="/move-out"
            onClick={() => onClose()}
            onKeyDown={(e) => e.key === "Escape" && onClose(true)}
            className="group relative overflow-hidden rounded-2xl bg-maroon-800 p-5 text-white"
          >
            <Image
              src={feature.images[0]}
              alt=""
              fill
              sizes="280px"
              className="object-cover opacity-40 transition-transform duration-700 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-maroon-900 via-maroon-900/40 to-transparent" />
            <div className="relative flex h-full flex-col justify-end">
              <p className="text-xs text-white/70">{dateRange(sale.startsAt, sale.endsAt)}</p>
              <p className="text-lg font-semibold">{sale.name}</p>
              <span className="mt-2 inline-flex items-center gap-1 text-sm font-medium">
                Preview <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" aria-hidden />
              </span>
            </div>
          </Link>
        )}
      </div>
    </motion.div>
  );
}

function CategoryNav() {
  const pathname = usePathname();
  const params = useSearchParams();
  const { categories } = useCatalog();
  const sale = useConfig().events.moveOut;
  const current = pathname === "/browse" ? (params.get("category") ?? "all") : null;

  const items = [
    { key: "all", href: "/browse", label: "All", icon: "" },
    ...categories.map((c) => ({ key: c.id, href: `/browse?category=${c.id}`, label: c.label, icon: c.icon })),
  ];

  return (
    <nav className="border-b border-line" aria-label="Categories">
      <div className="container-page">
        <div className="-mx-1 no-scrollbar flex items-center gap-0.5 overflow-x-auto">
          {sale.enabled && (
            <>
              <Link
                href="/move-out"
                className="relative shrink-0 px-3 py-3 text-[13px] font-semibold text-maroon-700 hover:text-maroon-600"
              >
                {sale.name}
                {pathname === "/move-out" && (
                  <motion.span layoutId="cat-underline" className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-maroon-700" />
                )}
              </Link>
              <span className="mx-1 h-4 w-px shrink-0 bg-line-strong" aria-hidden />
            </>
          )}
          {items.map((item) => {
            const active = current === item.key;
            return (
              <Link
                key={item.key}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex shrink-0 items-center gap-1.5 px-3 py-3 text-[13px] font-medium transition-colors",
                  active ? "text-ink-950" : "text-ink-500 hover:text-ink-950",
                )}
              >
                {item.icon && <CategoryIcon name={item.icon} className="size-3.5 md:hidden" />}
                {item.label}
                {active && <motion.span layoutId="cat-underline" className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-ink-950" />}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}

function CountBadge({ count }: { count: number }) {
  return (
    <AnimatePresence>
      {count > 0 && (
        <motion.span
          key={count}
          initial={{ scale: 0.4 }}
          animate={{ scale: 1 }}
          exit={{ scale: 0 }}
          transition={{ type: "spring", stiffness: 600, damping: 15 }}
          className="absolute top-1 right-1 grid min-w-4 place-items-center rounded-full bg-maroon-700 px-1 text-[10px] leading-4 font-semibold text-white"
        >
          {count}
        </motion.span>
      )}
    </AnimatePresence>
  );
}

function HeaderActions() {
  const { user, saved, conversations } = useStore();
  const { features } = useConfig();
  const unreadChats = conversations.reduce((n, c) => n + c.unread, 0);
  const iconLink = "relative size-10 place-items-center rounded-xl text-ink-700 transition-colors hover:bg-surface hover:text-ink-950";

  return (
    <>
      <Link href="/saved" className={cn(iconLink, "hidden md:grid")} aria-label={`Saved items (${saved.length})`}>
        <Heart className="size-5" aria-hidden />
        <CountBadge count={saved.length} />
      </Link>
      {user && (
        <>
          {features.messaging && (
            <Link href="/inbox" className={cn(iconLink, "grid")} aria-label={`Messages (${unreadChats} unread)`}>
              <MessageCircle className="size-5" aria-hidden />
              <CountBadge count={unreadChats} />
            </Link>
          )}
          <NotificationBell />
        </>
      )}
      <Link href="/sell" className={buttonClass("dark", "md", "ml-1 h-10 max-md:hidden")}>
        <Plus className="size-4" aria-hidden /> Sell
      </Link>
      {user ? (
        <AccountMenu name={user.name} email={user.email} />
      ) : (
        <Link href="/sign-in" className={buttonClass("outline", "md", "ml-1 h-10")}>
          Log in
        </Link>
      )}
    </>
  );
}

function AccountMenu({ name, email }: { name: string; email: string }) {
  const { signOut } = useStore();
  const { features } = useConfig();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, open, () => setOpen(false));
  useOnNavigate(() => setOpen(false));

  const links = [
    { href: "/me", label: "Purchases", icon: Package },
    { href: "/me?tab=selling", label: "Selling", icon: Store },
    ...(features.sellerDashboard ? [{ href: "/dashboard", label: "Seller dashboard", icon: ChartNoAxesColumn }] : []),
    ...(features.messaging ? [{ href: "/inbox", label: "Messages", icon: MessageCircle }] : []),
    { href: "/saved", label: "Saved", icon: Heart },
    { href: "/sell", label: "Sell an item", icon: Plus },
  ];

  return (
    <div ref={ref} className="relative ml-1">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Account menu"
        className="flex rounded-full ring-offset-2 ring-offset-canvas transition-shadow hover:ring-2 hover:ring-line-strong"
      >
        <Avatar name={name} size={36} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="absolute top-full right-0 z-50 mt-2 w-72 origin-top-right rounded-2xl border border-line bg-elevated p-2 shadow-pop"
          >
            <div className="flex items-center gap-3 px-3 py-2.5">
              <Avatar name={name} size={36} />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-ink-950">{name}</p>
                <p className="truncate text-xs text-ink-500">{email}</p>
              </div>
            </div>
            <div className="my-1 h-px bg-line" />
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                role="menuitem"
                className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-ink-700 hover:bg-surface hover:text-ink-950"
              >
                <l.icon className="size-4 text-ink-500" aria-hidden />
                {l.label}
              </Link>
            ))}
            <div className="my-1 h-px bg-line" />
            <div className="px-2 py-2">
              <ThemeSegmented />
            </div>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                signOut();
                setOpen(false);
              }}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-ink-700 hover:bg-surface hover:text-ink-950"
            >
              <LogOut className="size-4 text-ink-500" aria-hidden />
              Log out
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
