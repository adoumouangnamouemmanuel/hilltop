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
  const { events, brand } = useConfig();
  if (pathname.startsWith("/sign")) return null;

  const columns: { title: string; links: [string, string][] }[] = [
    { title: "Shop", links: categories.slice(0, 7).map((c) => [c.label, `/browse?category=${c.id}`]) },
    {
      title: "Sell",
      links: [
        ["List an item", "/sell"],
        ["Promote a listing", "/sell#promote"],
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
        ["How it works", "/#how"],
        ["Safe meet-ups", "/#how"],
        ["Contact us", `mailto:${brand.supportEmail}`],
      ],
    },
  ];

  return (
    <footer className="mt-24 hidden border-t border-line bg-surface md:block">
      <div className="container-page grid gap-10 py-14 lg:grid-cols-[1.1fr_2fr]">
        <div className="max-w-xs">
          <Logo />
          <p className="mt-4 text-sm leading-6 text-ink-500">The student marketplace for Ashesi. Verified students, protected payments.</p>
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
  );
}
