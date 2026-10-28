import type { Metadata } from "next";
import { GovernanceScreen } from "@/components/governance/governance-screen";

export const metadata: Metadata = { title: "Gouvernance" };

export default function Page() {
  return <GovernanceScreen />;
}
