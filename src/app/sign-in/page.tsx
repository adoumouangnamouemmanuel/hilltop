import type { Metadata } from "next";
import { Suspense } from "react";
import { unsplash } from "@/lib/catalog";
import { AuthShell } from "@/components/auth-shell";
import { SignInFlow } from "./sign-in-flow";

export const metadata: Metadata = { title: "Log in" };

export default function SignInPage() {
  return (
    <AuthShell image={unsplash("1522202176988-66273c2fd55f", 2000)}>
      <Suspense>
        <SignInFlow />
      </Suspense>
    </AuthShell>
  );
}
