import type { Metadata } from "next";
import { ServingScreen } from "@/components/serving/serving-screen";

export const metadata: Metadata = { title: "Diffusion" };

export default function Page() {
  return <ServingScreen />;
}
