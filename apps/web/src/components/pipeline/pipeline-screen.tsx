"use client";

import { useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { ShellMessage } from "@/components/shell/shell-states";
import { useShell } from "@/components/shell/shell-context";
import { Skeleton } from "@/components/ui/skeleton";
import { syntheticGraph } from "@/lib/pipeline/synthetic";
import { useProjectGraph, warmLayout } from "@/lib/pipeline/use-graph";

function CanvasSkeleton() {
  return (
    <div className="absolute inset-0 flex gap-3.5 bg-cv pt-[72px] pr-7 pl-[84px]" aria-busy>
      {[0, 1, 2, 3].map((lane) => (
        <Skeleton key={lane} className="h-[70vh] flex-1 rounded-3xl opacity-60" />
      ))}
    </div>
  );
}

// React Flow and the canvas load after the page: the shell and the skeleton show first,
// and no other screen carries them.
const loadCanvas = () => import("./pipeline-canvas");
const PipelineCanvas = dynamic(() => loadCanvas().then((m) => m.PipelineCanvas), {
  ssr: false,
  loading: CanvasSkeleton,
});

/** /projects/[id]/pipeline: the canvas, or its first-launch state for an empty project. */
export function PipelineScreen({ allowSynthetic }: { allowSynthetic: boolean }) {
  const shell = useShell();
  const params = useSearchParams();
  const syntheticSize = allowSynthetic ? Number(params.get("synthetic")) || 0 : 0;
  const graph = useProjectGraph(shell.project.id, syntheticSize === 0);
  const synthetic = useMemo(
    () => (syntheticSize ? syntheticGraph(syntheticSize) : null),
    [syntheticSize],
  );
  const data = synthetic ?? graph.data;
  // The canvas code, the layout worker and ELK load while the graph is fetched, not after
  // it: in series they took seconds on a busy machine.
  useEffect(() => {
    void loadCanvas();
    warmLayout();
  }, []);

  if (!data) {
    if (graph.isError) {
      return (
        <ShellMessage
          title="Impossible de charger le pipeline"
          description="L’API Forja ne répond pas ou a refusé la demande."
          action={{ label: "Réessayer", onClick: () => void graph.refetch() }}
        />
      );
    }
    return <CanvasSkeleton />;
  }
  return (
    <PipelineCanvas projectId={shell.project.id} graph={data} synthetic={synthetic !== null} />
  );
}
