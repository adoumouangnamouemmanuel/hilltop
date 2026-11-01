import Link from "next/link";
import { buttonClass } from "@hilltop/ui/ui";

export default function NotFound() {
  return (
    <div className="grid min-h-dvh place-items-center px-6 text-center">
      <div>
        <p className="text-sm font-medium text-maroon-700">404</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-ink-950">This page doesn’t exist</h1>
        <p className="mt-2 text-sm text-ink-500">Check the address, or head back to the overview.</p>
        <Link href="/" className={buttonClass("dark", "md", "mt-6")}>
          Back to overview
        </Link>
      </div>
    </div>
  );
}
