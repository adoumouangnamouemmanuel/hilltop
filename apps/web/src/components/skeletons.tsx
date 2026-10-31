import { ListingCardSkeleton } from "./listing-card";
import { cn } from "./ui";

const block =
  "animate-shimmer rounded-lg bg-[linear-gradient(90deg,var(--surface)_0%,var(--surface-2)_50%,var(--surface)_100%)] bg-[length:200%_100%]";

export function Bone({ className }: { className?: string }) {
  return <div className={cn(block, className)} aria-hidden />;
}

export function GridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-8 sm:grid-cols-3 sm:gap-x-4 lg:grid-cols-4">
      {Array.from({ length: count }, (_, i) => (
        <ListingCardSkeleton key={i} />
      ))}
    </div>
  );
}

/** Loading state for a listing page: gallery on the left, buy box on the right. */
export function ListingSkeleton() {
  return (
    <div className="container-page pt-6" role="status" aria-label="Loading listing">
      <Bone className="h-3 w-48" />
      <div className="mt-5 grid gap-8 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-12">
        <Bone className="aspect-square w-full rounded-2xl" />
        <div className="space-y-4">
          <Bone className="h-7 w-3/4" />
          <Bone className="h-9 w-1/3" />
          <div className="grid grid-cols-2 gap-2">
            <Bone className="h-14" />
            <Bone className="h-14" />
          </div>
          <Bone className="h-48 rounded-2xl" />
          <Bone className="h-36 rounded-2xl" />
        </div>
      </div>
    </div>
  );
}
