import type { Metadata } from "next";
import { Suspense } from "react";
import { InboxView } from "./inbox-view";

export const metadata: Metadata = { title: "Messages" };

export default function InboxPage() {
  return (
    <div className="container-page pt-4 sm:pt-8">
      <Suspense>
        <InboxView />
      </Suspense>
    </div>
  );
}
