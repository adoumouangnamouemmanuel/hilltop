import type { Metadata } from "next";
import { DisputesView } from "./view";

export const metadata: Metadata = { title: "Disputes" };

export default function Page() {
  return <DisputesView />;
}
