import type { Metadata } from "next";
import { Suspense } from "react";
import campusBanners from "@/assets/campus/campus-banners.jpg";
import { AuthShell } from "@/components/auth-shell";
import { SignUpFlow } from "./sign-up-flow";

export const metadata: Metadata = { title: "Create your account" };

export default function SignUpPage() {
  return (
    <AuthShell image={{ src: campusBanners, place: "Berekuso campus", position: "68% 50%" }}>
      <Suspense>
        <SignUpFlow />
      </Suspense>
    </AuthShell>
  );
}
