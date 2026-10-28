import type { Metadata } from "next";
import { SourcesScreen } from "@/components/sources/sources-screen";

export const metadata: Metadata = { title: "Sources" };

export default function Page() {
  return <SourcesScreen />;
}
