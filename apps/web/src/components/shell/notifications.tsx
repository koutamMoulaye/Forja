"use client";

import { useMemo } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Bell,
  BellRinging,
  Broom,
  ChartPieSlice,
  CheckCircle,
  WarningCircle,
  type Icon,
} from "@phosphor-icons/react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/cn";
import type { AppNotification } from "@/lib/events/live";
import { useBrowserNotifications } from "@/lib/notifications/browser";
import {
  notificationHref,
  notificationTone,
  useMarkRead,
  useNotifications,
} from "@/lib/notifications/queries";
import { useShell } from "./shell-context";

export type NotificationKind = "run" | "plan" | "mart" | "failure";

export type Notification = {
  id: string;
  kind: NotificationKind;
  title: string;
  detail: string;
  at: string | null;
  action: { label: string; href: string } | null;
};

const ICONS: Record<NotificationKind, { icon: Icon; className: string }> = {
  run: { icon: CheckCircle, className: "text-val-fg" },
  plan: { icon: Broom, className: "text-prop-fg" },
  mart: { icon: ChartPieSlice, className: "text-prop-fg" },
  failure: { icon: WarningCircle, className: "text-err-fg" },
};

const KINDS = { success: "run", failure: "failure", review: "plan", mart: "mart" } as const;

/** A notification of the API as the panel shows it. */
export function toItem(notification: AppNotification): Notification {
  const href = notificationHref(notification);
  return {
    id: notification.id,
    kind: KINDS[notificationTone(notification)],
    title: notification.title,
    detail: notification.detail ?? "",
    at: notification.created_at,
    action: href && notification.action ? { label: notification.action.label, href } : null,
  };
}

export type DayGroup = "pending" | "today" | "yesterday" | "earlier";

export function dayGroup(at: string | null, now = new Date()): DayGroup {
  if (!at) return "pending";
  const time = new Date(at).getTime();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (time >= startOfToday) return "today";
  return time >= startOfToday - 24 * 3600 * 1000 ? "yesterday" : "earlier";
}

const GROUP_LABELS: Record<DayGroup, string> = {
  pending: "À traiter",
  today: "Aujourd’hui",
  yesterday: "Hier",
  earlier: "Plus tôt",
};

export function relativeTime(at: string, now = Date.now()): string {
  const minutes = Math.round((now - Date.parse(at)) / 60_000);
  if (minutes < 1) return "à l’instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const date = new Date(at);
  const time = date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  const group = dayGroup(at, new Date(now));
  if (group === "today") return `aujourd’hui ${time}`;
  if (group === "yesterday") return `hier ${time}`;
  return `${date.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })} ${time}`;
}

/** Bell and popover (S2); its open state lives in the URL, ?panel=notifications. */
export function Notifications() {
  const shell = useShell();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const open = params.get("panel") === "notifications";
  const notifications = useNotifications();
  const markRead = useMarkRead();
  const browser = useBrowserNotifications(shell.me.user.id);

  const pages = notifications.data?.pages;
  const unreadCount = pages?.[0]?.unread ?? 0;
  const loaded = useMemo(() => (pages ?? []).flatMap((page) => page.items), [pages]);
  const unreadIds = new Set(loaded.filter((n) => !n.read_at).map((n) => n.id));
  const groups = (["today", "yesterday", "earlier"] as const)
    .map((group) => ({
      group,
      items: loaded.map(toItem).filter((item) => dayGroup(item.at) === group),
    }))
    .filter((entry) => entry.items.length > 0);

  const setOpen = (next: boolean) => {
    const search = new URLSearchParams(params.toString());
    if (next) search.set("panel", "notifications");
    else search.delete("panel");
    const query = search.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={unreadCount ? `Notifications, ${unreadCount} non lues` : "Notifications"}
          data-testid="notifications-bell"
          className="flex h-9 min-w-9 items-center justify-center gap-1.5 rounded-md border-0 bg-transparent px-2 text-tx2 transition-colors hover:bg-sunk hover:text-tx"
        >
          <Bell size={20} />
          {unreadCount ? (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-[10px] bg-acc px-1.5 text-[12px] font-bold text-on-acc tabular-nums">
              {unreadCount}
            </span>
          ) : null}
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="flex max-h-[min(640px,calc(100dvh-80px))] w-[420px] max-w-[calc(100vw-28px)] flex-col gap-0.5 overflow-y-auto"
        aria-label="Notifications"
      >
        <div className="flex items-center px-2.5 pt-2 pb-1">
          <h2 className="m-0 text-section font-semibold">Notifications</h2>
          {unreadCount ? (
            <button
              type="button"
              onClick={() => markRead.mutate(null)}
              className="ml-auto border-0 bg-transparent p-0 text-meta font-medium text-acc-tx hover:underline"
            >
              Tout marquer comme lu
            </button>
          ) : null}
        </div>
        {groups.length === 0 ? (
          <div className="px-2.5 py-8 text-center text-[14px] text-tx3">
            {notifications.isPending ? "Chargement…" : "Rien de nouveau pour l’instant."}
          </div>
        ) : (
          groups.map(({ group, items }) => (
            <div
              key={group}
              role="group"
              aria-label={GROUP_LABELS[group]}
              className="flex flex-col gap-0.5"
            >
              <div className="px-2.5 pt-2.5 pb-1 text-[12.5px] font-semibold text-tx3">
                {GROUP_LABELS[group]}
              </div>
              {items.map((item) => (
                <NotificationItem
                  key={item.id}
                  item={item}
                  unread={unreadIds.has(item.id)}
                  onAct={() => {
                    if (unreadIds.has(item.id)) markRead.mutate([item.id]);
                    setOpen(false);
                  }}
                />
              ))}
            </div>
          ))
        )}
        {notifications.hasNextPage ? (
          <button
            type="button"
            onClick={() => void notifications.fetchNextPage()}
            disabled={notifications.isFetchingNextPage}
            className="mx-2.5 my-1 h-8 rounded-sm border-0 bg-transparent text-meta font-medium text-acc-tx hover:bg-sunk"
          >
            {notifications.isFetchingNextPage ? "Chargement…" : "Notifications plus anciennes"}
          </button>
        ) : null}
        <BrowserNotices browser={browser} />
      </PopoverContent>
    </Popover>
  );
}

function BrowserNotices({ browser }: { browser: ReturnType<typeof useBrowserNotifications> }) {
  if (browser.permission === "unsupported") return null;
  const link =
    "ml-auto border-0 bg-transparent p-0 font-medium whitespace-nowrap text-acc-tx hover:underline";
  return (
    <div
      className="mt-1 flex items-center gap-2 border-t border-sunk px-2.5 pt-2.5 pb-1.5 text-meta text-tx3"
      data-testid="browser-notifications"
    >
      <BellRinging size={16} aria-hidden className="flex-none" />
      {browser.permission === "denied" ? (
        <span>Notifications du navigateur bloquées dans ses réglages.</span>
      ) : browser.on ? (
        <>
          <span>Notifications du navigateur activées.</span>
          <button type="button" onClick={browser.disable} className={link}>
            Désactiver
          </button>
        </>
      ) : (
        <>
          <span>Être prévenu hors de l’onglet Forja.</span>
          <button type="button" onClick={() => void browser.enable()} className={link}>
            Activer
          </button>
        </>
      )}
    </div>
  );
}

export function NotificationItem({
  item,
  unread,
  onAct,
}: {
  item: Notification;
  unread: boolean;
  onAct?: () => void;
}) {
  const { icon: KindIcon, className } = ICONS[item.kind];
  return (
    <div className="flex gap-3 rounded-lg p-2.5 text-tx transition-colors hover:bg-sunk">
      <KindIcon size={22} weight="duotone" className={cn("mt-px flex-none", className)} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-baseline gap-2">
          <span className="min-w-0 flex-1 text-[14px] font-semibold">{item.title}</span>
          {unread ? (
            <span
              title="Non lue"
              aria-label="Non lue"
              role="img"
              className="size-2 flex-none rounded-full bg-acc"
            />
          ) : null}
        </div>
        <span className="truncate text-meta text-tx2" title={item.detail}>
          {item.detail}
        </span>
        <div className="mt-1.5 flex items-center gap-2.5">
          {item.action ? (
            <Link
              href={item.action.href}
              onClick={onAct}
              className="flex h-[30px] items-center rounded-sm bg-node px-3 text-meta font-medium text-tx no-underline shadow-sm hover:no-underline hover:shadow-hover"
            >
              {item.action.label}
            </Link>
          ) : null}
          {item.at ? (
            <span className="text-[12.5px] whitespace-nowrap text-tx3">
              {relativeTime(item.at)}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
