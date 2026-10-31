import type { Metadata } from "next";
import { Suspense } from "react";
import { SellForm } from "./sell-form";

export const metadata: Metadata = { title: "Sell an item" };

export default function SellPage() {
  return (
    <div className="container-page pt-6 sm:pt-10">
      <Suspense>
        <SellForm />
      </Suspense>
    </div>
  );
}
