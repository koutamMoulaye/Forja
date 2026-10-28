import type { Metadata } from "next";
import { IndicatorsScreen } from "@/components/agent/indicators-screen";

export const metadata: Metadata = { title: "Indicateurs" };

export default function Page() {
  return <IndicatorsScreen />;
}
