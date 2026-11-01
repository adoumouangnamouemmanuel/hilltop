import type { Metadata } from "next";
import { CatalogView } from "./view";

export const metadata: Metadata = { title: "Catalog" };

export default function Page() {
  return <CatalogView />;
}
