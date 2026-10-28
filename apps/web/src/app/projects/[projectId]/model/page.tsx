import type { Metadata } from "next";
import { ModelScreen } from "@/components/model/model-screen";

export const metadata: Metadata = { title: "Modèle en étoile" };

export default function Page() {
  return <ModelScreen />;
}
