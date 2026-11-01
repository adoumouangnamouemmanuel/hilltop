import type { Metadata } from "next";
import { TeamView } from "./view";

export const metadata: Metadata = { title: "Team and roles" };

export default function Page() {
  return <TeamView />;
}
