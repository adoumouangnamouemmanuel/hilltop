import type { Metadata } from "next";
import { SellForm } from "./sell-form";

export const metadata: Metadata = { title: "Sell an item" };

export default function SellPage() {
  return (
    <div className="container-page pt-6 sm:pt-10">
      <h1 className="text-2xl font-semibold tracking-[-0.025em] text-ink-950 sm:text-3xl">List an item</h1>
      <p className="mt-1.5 text-sm text-ink-500">Free to list. You&rsquo;re paid as soon as the buyer confirms collection.</p>
      <SellForm />
    </div>
  );
}
