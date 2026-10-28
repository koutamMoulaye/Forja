"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/components/ui/toast";
import { setWatched, systemNotify, watchedIds } from "@/lib/agent/watch";
import {
  applyJob,
  applyNotification,
  openEventStream,
  refreshAfterGap,
  type AppNotification,
} from "@/lib/events/live";
import { browserNotificationsOn } from "@/lib/notifications/browser";
import { notificationHref, notificationTone } from "@/lib/notifications/queries";
import { useShell } from "./shell-context";

/** Notifications worth a toast: the end of the agent's work and the data mart decisions.
 * Runs have their own pill and toast in the top bar. */
const TOASTED = new Set<AppNotification["kind"]>([
  "ai_job_done",
  "mart_approval",
  "mart_approved",
  "mart_rejected",
  "mart_published",
]);

/**
 * The event stream of the session (GET /events): runs and notifications update the
 * screens as they happen, the end of the agent's work is announced wherever the user is,
 * and the browser notifies too when the user asked for it.
 */
export function LiveEvents() {
  const shell = useShell();
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const userId = shell.me.user.id;
  const context = useRef({ pathname, userId, router });
  useEffect(() => {
    context.current = { pathname, userId, router };
  }, [pathname, userId, router]);

  useEffect(() => {
    const announce = (notification: AppNotification) => {
      const { pathname: here, userId: me, router: navigate } = context.current;
      const href = notificationHref(notification);
      const target = notification.action?.target_id;
      const watched = target ? watchedIds(me).has(target) : false;
      if (target && watched) setWatched(me, target, false);
      const open = href ? () => navigate.push(href) : undefined;
      if (TOASTED.has(notification.kind)) {
        const onScreen =
          href !== null &&
          (here === href ||
            (target !== undefined && here.endsWith(`/ask/${target}`)) ||
            (target !== undefined && here.endsWith(`/marts/${target}/preview`)));
        if (!onScreen || watched) {
          const show = notificationTone(notification) === "failure" ? toast.error : toast.success;
          show({
            title: notification.title,
            description: notification.detail ?? undefined,
            action: open ? { label: "Ouvrir", onClick: open } : undefined,
          });
        }
      }
      if (watched || browserNotificationsOn(me)) {
        systemNotify(notification.title, notification.detail ?? "", open);
      }
    };
    return openEventStream({
      onJob: (job) => applyJob(queryClient, job),
      onNotification: (notification) => {
        applyNotification(queryClient, notification);
        announce(notification);
      },
      onReconnect: () => refreshAfterGap(queryClient),
    });
  }, [queryClient]);

  return null;
}
