import { ButtonLink } from "@/components/ui";

export default function NotFound() {
  return (
    <div className="container-page flex flex-col items-center py-24 text-center">
      <p className="text-sm font-medium text-ink-400">404</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-[-0.025em] text-ink-950">We couldn&rsquo;t find that page</h1>
      <p className="mt-2 text-sm text-ink-500">It may have moved, or the item may have sold.</p>
      <ButtonLink href="/" variant="dark" className="mt-6">
        Back to home
      </ButtonLink>
    </div>
  );
}
