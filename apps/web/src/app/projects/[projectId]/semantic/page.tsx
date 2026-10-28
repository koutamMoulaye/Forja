import type { Metadata } from "next";
import { SemanticScreen } from "@/components/semantic/semantic-screen";

export const metadata: Metadata = { title: "Couche sémantique" };

export default function Page() {
  return <SemanticScreen />;
}
