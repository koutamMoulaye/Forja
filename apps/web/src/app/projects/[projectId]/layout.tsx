import { Suspense } from "react";
import { AppShell } from "@/components/shell/app-shell";
import { ShellLoading } from "@/components/shell/shell-states";

export default function ProjectLayout({ children }: LayoutProps<"/projects/[projectId]">) {
  return (
    <Suspense fallback={<ShellLoading />}>
      <AppShell>{children}</AppShell>
    </Suspense>
  );
}
