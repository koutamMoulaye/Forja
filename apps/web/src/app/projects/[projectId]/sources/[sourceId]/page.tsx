import type { Metadata } from "next";
import { SourceDetail } from "@/components/sources/source-detail";

export const metadata: Metadata = { title: "Source" };

export default async function Page({
  params,
}: PageProps<"/projects/[projectId]/sources/[sourceId]">) {
  const { sourceId } = await params;
  return <SourceDetail key={sourceId} sourceId={sourceId} />;
}
