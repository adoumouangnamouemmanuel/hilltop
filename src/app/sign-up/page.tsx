import type { Metadata } from "next";
import { Suspense } from "react";
import { unsplash } from "@/lib/catalog";
import { AuthShell } from "@/components/auth-shell";
import { SignUpFlow } from "./sign-up-flow";

export const metadata: Metadata = { title: "Create your account" };

export default function SignUpPage() {
  return (
    <AuthShell image={unsplash("1523240795612-9a054b0db644", 2000)}>
      <Suspense>
        <SignUpFlow />
      </Suspense>
    </AuthShell>
  );
}
