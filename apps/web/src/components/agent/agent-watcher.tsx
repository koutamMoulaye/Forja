"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useShell } from "@/components/shell/shell-context";
import { toast } from "@/components/ui/toast";
import { useConversations } from "@/lib/agent/queries";
import { conversationOutcome } from "@/lib/agent/view";
import { setWatched, systemNotify, watchedIds } from "@/lib/agent/watch";

/**
 * Announces the end of the agent's work wherever the user is: a version finished while
 * its conversation was not on screen (or the user asked to be told), or a mart published.
 */
export function AgentWatcher() {
  const shell = useShell();
  const router = useRouter();
  const pathname = usePathname();
  const conversations = useConversations(shell.project.id);
  const previous = useRef<Map<string, string> | null>(null);
  const userId = shell.me.user.id;

  useEffect(() => {
    const requests = (conversations.data ?? []).filter((r) => r.owner_id === userId);
    const states = new Map(requests.map((r) => [r.id, conversationOutcome(r).state]));
    const before = previous.current;
    previous.current = states;
    if (!before) return; // first read: nothing has changed yet
    const watched = watchedIds(userId);
    for (const request of requests) {
      const was = before.get(request.id);
      const outcome = conversationOutcome(request);
      if (!was || was === outcome.state || outcome.state === "working") continue;
      const href = outcome.href(shell.project.id);
      const onScreen =
        pathname === href || pathname === `/projects/${shell.project.id}/ask/${request.id}`;
      if (onScreen && !watched.has(request.id)) continue;
      setWatched(userId, request.id, false);
      const open = () => router.push(href);
      const notify = outcome.tone === "error" ? toast.error : toast.success;
      notify({
        title: outcome.title,
        description: outcome.detail,
        action: { label: "Ouvrir", onClick: open },
      });
      systemNotify(outcome.title, outcome.detail, open);
    }
  }, [conversations.data, userId, pathname, router, shell.project.id]);

  return null;
}
