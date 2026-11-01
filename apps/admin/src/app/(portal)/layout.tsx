import { Shell } from "@/components/shell";

export default function PortalLayout({ children }: LayoutProps<"/">) {
  return <Shell>{children}</Shell>;
}
