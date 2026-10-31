import type { Metadata } from "next";
import { NotificationsView } from "./notifications-view";

export const metadata: Metadata = { title: "Notifications" };

export default function NotificationsPage() {
  return (
    <div className="container-page max-w-2xl pt-6 sm:pt-10">
      <NotificationsView />
    </div>
  );
}
