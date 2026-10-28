import type { Metadata } from "next";
import { MartsScreen } from "@/components/agent/marts-screen";

export const metadata: Metadata = { title: "Mes data marts" };

export default function Page() {
  return <MartsScreen />;
}
