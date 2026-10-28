import type { Metadata } from "next";
import { CleaningScreen } from "@/components/silver/cleaning-screen";

export const metadata: Metadata = { title: "Nettoyage" };

export default function Page() {
  return <CleaningScreen />;
}
