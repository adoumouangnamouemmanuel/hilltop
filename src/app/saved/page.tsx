import type { Metadata } from "next";
import { SavedView } from "./saved-view";

export const metadata: Metadata = { title: "Saved items" };

export default function SavedPage() {
  return (
    <div className="container-page pt-6 sm:pt-10">
      <SavedView />
    </div>
  );
}
