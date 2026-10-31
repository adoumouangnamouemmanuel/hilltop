import type { Metadata } from "next";
import { Suspense } from "react";
import { MyMarket } from "./my-market";

export const metadata: Metadata = { title: "Your account" };

export default function MePage() {
  return (
    <div className="container-page max-w-5xl pt-6 sm:pt-10">
      <Suspense>
        <MyMarket />
      </Suspense>
    </div>
  );
}
