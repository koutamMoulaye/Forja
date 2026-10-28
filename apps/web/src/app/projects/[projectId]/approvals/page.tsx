import type { Metadata } from "next";
import { ApprovalsScreen } from "@/components/agent/approvals-screen";

export const metadata: Metadata = { title: "Data marts à approuver" };

export default function Page() {
  return <ApprovalsScreen />;
}
