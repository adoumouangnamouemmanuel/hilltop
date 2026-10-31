import { Bone, GridSkeleton } from "@/components/skeletons";

export default function Loading() {
  return (
    <div className="container-page pt-8" role="status" aria-label="Loading seller">
      <div className="flex items-center gap-6 border-b border-line pb-8">
        <Bone className="size-[88px] rounded-full" />
        <div className="flex-1 space-y-3">
          <Bone className="h-7 w-56" />
          <Bone className="h-4 w-32" />
          <Bone className="h-4 w-80" />
        </div>
      </div>
      <div className="mt-10">
        <GridSkeleton count={6} />
      </div>
    </div>
  );
}
