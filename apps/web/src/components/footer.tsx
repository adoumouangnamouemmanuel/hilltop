"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useConfig } from "@/lib/config";
import { useCatalog } from "@/lib/use-catalog";
import { Logo } from "./logo";
import { ThemeSegmented } from "./theme-toggle";

export function Footer() {
  const pathname = usePathname();
  const { categories } = useCatalog();
  const { events, brand, payments } = useConfig();
  if (pathname.startsWith("/sign")) return null;

  const columns: { title: string; links: [string, string][] }[] = [
    { title: "Shop", links: categories.slice(0, 7).map((c) => [c.label, `/browse?category=${c.id}`]) },
    {
      title: "Sell",
      links: [
        ["List an item", "/sell"],
        ...(payments.inApp ? [["Promote a listing", "/sell#promote"] as [string, string]] : []),
        ...(events.moveOut.enabled ? [[events.moveOut.name, "/move-out"] as [string, string]] : []),
      ],
    },
    {
      title: "Account",
      links: [
        ["Purchases", "/me"],
        ["Your listings", "/me?tab=selling"],
        ["Saved items", "/saved"],
      ],
    },
    {
      title: "Help",
      links: [
        ["Help centre", "/help"],
        ["How it works", "/#how"],
        ["Privacy", "/privacy"],
        ["Contact us", `mailto:${brand.supportEmail}`],
      ],
    },
  ];

  return (
    <>
      {/* Phones: the essentials, above the tab bar. */}
      <footer className="mt-16 border-t border-line bg-surface md:hidden">
        {/* Bottom padding clears the floating tab bar (62px + 12px gap + the phone's safe area). */}
        <div className="container-page pt-8 pb-[calc(6.5rem+env(safe-area-inset-bottom))]">
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm font-medium text-ink-700">
            <Link href="/help">Help</Link>
            <Link href="/#how">How it works</Link>
            <Link href="/privacy">Privacy</Link>
            <a href={`mailto:${brand.supportEmail}`}>Contact us</a>
          </div>
          <p className="mt-4 text-xs text-ink-500">&copy; 2026 Hilltop. A student project, not an official Ashesi service.</p>
        </div>
      </footer>
      <footer className="mt-24 hidden border-t border-line bg-surface md:block">
        <div className="container-page grid gap-10 py-14 lg:grid-cols-[1.1fr_2fr]">
          <div className="max-w-xs">
            <Logo />
            <p className="mt-4 text-sm leading-6 text-ink-500">
              The student marketplace for Ashesi. Verified students, safe campus meet-ups.
            </p>
            <div className="mt-6 w-56">
              <ThemeSegmented />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
            {columns.map((col) => (
              <div key={col.title}>
                <p className="text-sm font-semibold text-ink-950">{col.title}</p>
                <ul className="mt-4 space-y-3">
                  {col.links.map(([label, href]) => (
                    <li key={label}>
                      <Link href={href} className="text-sm text-ink-500 transition-colors hover:text-ink-950">
                        {label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
        <div className="border-t border-line">
          <div className="container-page flex flex-col gap-2 py-6 text-xs text-ink-500 sm:flex-row sm:justify-between">
            <p>&copy; 2026 Hilltop. A student project, not an official Ashesi service.</p>
            <p>Berekuso, Ghana</p>
          </div>
        </div>
      </footer>
    </>
  );
}
