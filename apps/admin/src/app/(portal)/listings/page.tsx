import type { Metadata } from "next";
import { ListingsView } from "./view";

export const metadata: Metadata = { title: "Listings" };

export default function Page() {
  return <ListingsView />;
}
