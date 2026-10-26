import {
  BracketsCurly,
  Broom,
  ChartBar,
  ChartPieSlice,
  Cube,
  Database,
  Export,
  FileCsv,
  FileXls,
  Star,
  type IconProps,
} from "@phosphor-icons/react";
import type { GraphNode } from "@/lib/pipeline/model";

type Iconic = Pick<GraphNode, "type" | "name" | "id">;

/** The Phosphor icon of a node, as in ForjaApp: the file format for sources. */
export function NodeIcon({ node, ...props }: { node: Iconic } & IconProps) {
  switch (node.type) {
    case "source": {
      const extension = node.name.split(".").pop()?.toLowerCase();
      if (extension === "xlsx" || extension === "xls") return <FileXls {...props} />;
      if (extension === "json" || extension === "jsonl" || extension === "ndjson") {
        return <BracketsCurly {...props} />;
      }
      if (extension === "parquet") return <Database {...props} />;
      return <FileCsv {...props} />;
    }
    case "silver":
      return <Broom {...props} />;
    case "dimension":
    case "date_dimension":
      return <Cube {...props} />;
    case "fact":
      return <Star {...props} />;
    case "mart":
      return <ChartPieSlice {...props} />;
    case "destination":
      return node.id === "dest_exports" ? <Export {...props} /> : <ChartBar {...props} />;
  }
}
