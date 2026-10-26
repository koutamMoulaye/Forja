import type { GraphNode } from "@/lib/pipeline/model";

/** The detailed screen a node opens on (double-click, « Ouvrir »). */
export function detailHref(projectId: string, node: Pick<GraphNode, "type" | "ref">): string {
  const base = `/projects/${projectId}`;
  switch (node.type) {
    case "source":
      return `${base}/sources`;
    case "silver":
      return node.ref ? `${base}/sources/${node.ref}/plan` : `${base}/cleaning`;
    case "dimension":
    case "fact":
    case "date_dimension":
      return `${base}/model`;
    case "mart":
      return node.ref ? `${base}/marts/${node.ref}/preview` : `${base}/marts`;
    case "destination":
      return `${base}/serving`;
  }
}
