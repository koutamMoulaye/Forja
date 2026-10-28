import type { Metadata } from "next";
import { ConversationScreen } from "@/components/agent/conversation-screen";

export const metadata: Metadata = { title: "Poser une question" };

export default function Page() {
  return <ConversationScreen />;
}
