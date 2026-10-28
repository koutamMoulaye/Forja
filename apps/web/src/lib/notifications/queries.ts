"use client";

import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, unwrap } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import {
  notificationKeys,
  offlinePoll,
  useLiveEvents,
  type AppNotification,
} from "@/lib/events/live";

export type NotificationPage = components["schemas"]["NotificationPage"];
export const NOTIFICATIONS_PAGE = 20;

/** The page an action leads to. */
export function notificationHref(notification: AppNotification): string | null {
  const action = notification.action;
  const project = notification.project_id;
  if (!action || !project) return null;
  const base = `/projects/${project}`;
  switch (action.target_type) {
    case "run":
      return `${base}/runs/${action.target_id}`;
    case "source":
      return `${base}/sources/${action.target_id}/plan`;
    case "gold_plan":
      return `${base}/model`;
    case "conversation":
      return `${base}/ask/${action.target_id}`;
    case "mart":
      return `${base}/marts/${action.target_id}/preview`;
  }
}

export type NotificationTone = "success" | "failure" | "review" | "mart";

export function notificationTone(notification: AppNotification): NotificationTone {
  switch (notification.kind) {
    case "run_failed":
    case "mart_rejected":
      return "failure";
    case "run_succeeded":
    case "mart_published":
    case "mart_approved":
      return "success";
    case "plan_review":
      return "review";
    default:
      return "mart";
  }
}

/** The user's notifications, newest first, 20 at a time. */
export function useNotifications(enabled = true) {
  const live = useLiveEvents();
  return useInfiniteQuery({
    queryKey: notificationKeys.all,
    enabled,
    initialPageParam: 0,
    queryFn: async ({ pageParam }): Promise<NotificationPage> =>
      unwrap(
        await api.GET("/notifications", {
          params: { query: { limit: NOTIFICATIONS_PAGE, offset: pageParam } },
        }),
      ),
    getNextPageParam: (last) =>
      last.offset + last.items.length < last.total ? last.offset + last.items.length : undefined,
    refetchInterval: offlinePoll(live, 30_000),
  });
}

export function useMarkRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[] | null) =>
      unwrap(await api.POST("/notifications/read", { body: ids ? { ids } : {} })),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: notificationKeys.all }),
  });
}
