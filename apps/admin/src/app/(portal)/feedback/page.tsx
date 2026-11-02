import type { Metadata } from "next";
import { FeedbackView } from "./view";

export const metadata: Metadata = { title: "Feedback" };

export default function Page() {
  return <FeedbackView />;
}
