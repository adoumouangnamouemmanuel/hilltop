import { Bone } from "@/components/skeletons";

export default function Loading() {
  return (
    <div className="container-page pt-8" role="status" aria-label="Loading messages">
      <Bone className="h-[60vh] rounded-2xl" />
    </div>
  );
}
