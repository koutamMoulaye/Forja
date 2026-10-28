import type { Metadata } from "next";
import { PreviewScreen } from "@/components/agent/preview-screen";

export const metadata: Metadata = { title: "Aperçu de vérification" };

export default async function Page({
  params,
}: PageProps<"/projects/[projectId]/marts/[martId]/preview">) {
  const { martId } = await params;
  return <PreviewScreen key={martId} martId={martId} />;
}
