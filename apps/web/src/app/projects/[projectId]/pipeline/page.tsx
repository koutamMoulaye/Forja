import type { Metadata } from "next";
import { connection } from "next/server";
import { PipelineScreen } from "@/components/pipeline/pipeline-screen";
import { designSystemEnabled } from "@/lib/design-system-flag";

export const metadata: Metadata = { title: "Pipeline" };

export default async function Page() {
  // Read at request time: ?synthetic=200 draws a generated graph, for performance checks
  // (internal builds only, as /design-system).
  await connection();
  return <PipelineScreen allowSynthetic={designSystemEnabled()} />;
}
