import type { Metadata } from "next";
import { SettingsScreen } from "@/components/settings/settings-screen";

export const metadata: Metadata = { title: "Réglages du projet" };

export default function Page() {
  return <SettingsScreen />;
}
