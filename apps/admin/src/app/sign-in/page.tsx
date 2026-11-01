import type { Metadata } from "next";
import { SignIn } from "./sign-in";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage() {
  return <SignIn />;
}
