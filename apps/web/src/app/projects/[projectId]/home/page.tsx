import type { Metadata } from "next";
import { HomeScreen } from "@/components/agent/home-screen";

export const metadata: Metadata = { title: "Accueil" };

export default function Page() {
  return <HomeScreen />;
}
