import type { Metadata } from "next";
import { ConversationScreen } from "@/components/agent/conversation-screen";

export const metadata: Metadata = { title: "Conversation" };

export default async function Page({
  params,
}: PageProps<"/projects/[projectId]/ask/[conversationId]">) {
  const { conversationId } = await params;
  return <ConversationScreen key={conversationId} conversationId={conversationId} />;
}
