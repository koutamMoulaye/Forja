import type { Metadata } from "next";
import { PlanReviewScreen } from "@/components/silver/plan-review";

export const metadata: Metadata = { title: "Revue du plan Silver" };

export default async function Page({
  params,
}: PageProps<"/projects/[projectId]/sources/[sourceId]/plan">) {
  const { sourceId } = await params;
  return <PlanReviewScreen key={sourceId} sourceId={sourceId} />;
}
