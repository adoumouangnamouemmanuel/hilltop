import type { Metadata } from "next";
import { Suspense } from "react";
import { Bone } from "@/components/skeletons";
import { SellerDashboard } from "./seller-dashboard";

export const metadata: Metadata = { title: "Seller dashboard" };

export default function DashboardPage() {
  return (
    <div className="container-page pt-6 sm:pt-10">
      <Suspense fallback={<Bone className="h-[70vh] rounded-2xl" />}>
        <SellerDashboard />
      </Suspense>
    </div>
  );
}
