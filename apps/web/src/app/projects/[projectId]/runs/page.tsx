import type { Metadata } from "next";
import { RunsScreen } from "@/components/runs/runs-screen";

export const metadata: Metadata = { title: "Runs" };

export default function Page() {
  return <RunsScreen />;
}
