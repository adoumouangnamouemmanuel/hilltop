import type { Metadata } from "next";
import { PublishView } from "./view";

export const metadata: Metadata = { title: "Publish" };

export default function Page() {
  return <PublishView />;
}
