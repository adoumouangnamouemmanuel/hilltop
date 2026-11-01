import type { Metadata } from "next";
import { Suspense } from "react";
import foundersPlaza from "@/assets/campus/founders-plaza.jpg";
import { AuthShell } from "@/components/auth-shell";
import { SignInFlow } from "./sign-in-flow";

export const metadata: Metadata = { title: "Log in" };

export default function SignInPage() {
  return (
    <AuthShell image={{ src: foundersPlaza, place: "Founders Plaza", position: "50% 60%" }}>
      <Suspense>
        <SignInFlow />
      </Suspense>
    </AuthShell>
  );
}
