import type { Metadata } from "next";
import { RunsScreen } from "@/components/runs/runs-screen";

export const metadata: Metadata = { title: "Détail du run" };

export default async function Page({ params }: PageProps<"/projects/[projectId]/runs/[runId]">) {
  const { runId } = await params;
  return <RunsScreen runId={runId} />;
}
