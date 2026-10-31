import type { Metadata } from "next";
import { Suspense } from "react";
import { SavedView } from "./saved-view";

export const metadata: Metadata = { title: "Saved" };

export default function SavedPage() {
  return (
    <div className="container-page pt-6 sm:pt-10">
      <Suspense>
        <SavedView />
      </Suspense>
    </div>
  );
}
