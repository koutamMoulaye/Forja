import type { Metadata } from "next";
import { Placeholder } from "@/components/shell/placeholders";

export const metadata: Metadata = { title: "Réglages du projet" };

export default function Page() {
  return <Placeholder screen="settings" />;
}
