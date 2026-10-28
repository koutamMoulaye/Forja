"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Bell,
  Broom,
  ChartPieSlice,
  CheckCircle,
  WarningCircle,
  type Icon,
} from "@phosphor-icons/react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/cn";
import { sectionHref } from "@/lib/navigation";
import { useConversations } from "@/lib/agent/queries";
import { conversationOutcome, type MartRequest } from "@/lib/agent/view";
import { JOB_TEXT, runDuration, useProjectRuns, type Job } from "@/lib/project/use-runs";
import { useShell } from "./shell-context";

export type NotificationKind = "run" | "plan" | "mart" | "failure";

export type Notification = {
  id: string;
  kind: NotificationKind;
  title: string;
  detail: string;
  at: string | null;
  action: { label: string; href: string };
};

const ICONS: Record<NotificationKind, { icon: Icon; className: string }> = {
  run: { icon: CheckCircle, className: "text-val-fg" },
  plan: { icon: Broom, className: "text-prop-fg" },
  mart: { icon: ChartPieSlice, className: "text-prop-fg" },
  failure: { icon: WarningCircle, className: "text-err-fg" },
};

const DAY = 24 * 3600 * 1000;

/** Finished runs of the last two days, newest first. */
export function runNotifications(runs: Job[], projectId: string, now = Date.now()): Notification[] {
  return runs
    .filter((run) => run.finished_at && now - Date.parse(run.finished_at) < 2 * DAY)
    .filter((run) => run.status === "succeeded" || run.status === "failed")
    .slice(0, 6)
    .map((run) => {
      const text = JOB_TEXT[run.type];
      const failed = run.status === "failed";
      return {
        id: `run:${run.id}`,
        kind: failed ? "failure" : "run",
        title: failed ? text.failed : text.done,
        detail: failed
          ? (run.error ?? "Le run s’est arrêté.")
          : `En ${runDuration(run) ?? "quelques secondes"}`,
        at: run.finished_at ?? null,
        action: {
          label: failed ? "Corriger" : "Voir le run",
          href: `/projects/${projectId}/runs/${run.id}`,
        },
      } satisfies Notification;
    });
}

/**
 * The analyst's notices: a question waiting, a preview ready, a mart published or
 * rejected, in the last two days; what is still being prepared is not a notice yet.
 */
export function agentNotifications(
  requests: MartRequest[],
  projectId: string,
  now = Date.now(),
): Notification[] {
  return requests
    .filter((request) => now - Date.parse(request.updated_at) < 2 * DAY)
    .map((request) => ({ request, outcome: conversationOutcome(request) }))
    .filter(({ outcome }) => outcome.state !== "working")
    .slice(0, 8)
    .map(({ request, outcome }) => ({
      id: `agent:${request.id}:${outcome.state}:${request.iterations?.length ?? 0}`,
      kind: outcome.tone === "error" ? "failure" : outcome.state === "published" ? "run" : "mart",
      title: outcome.title,
      detail: outcome.detail,
      at: outcome.state === "question" ? null : request.updated_at,
      action: {
        label:
          outcome.state === "question"
            ? "Répondre"
            : outcome.state === "ready"
              ? "Vérifier"
              : "Ouvrir",
        href: outcome.href(projectId),
      },
    }));
}

export function dayGroup(at: string | null, now = new Date()): "today" | "yesterday" | "pending" {
  if (!at) return "pending";
  const date = new Date(at);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return date.getTime() >= startOfToday ? "today" : "yesterday";
}

const GROUP_LABELS = { pending: "À traiter", today: "Aujourd’hui", yesterday: "Hier" } as const;

export function relativeTime(at: string, now = Date.now()): string {
  const minutes = Math.round((now - Date.parse(at)) / 60_000);
  if (minutes < 1) return "à l’instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const date = new Date(at);
  const time = date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  return dayGroup(at) === "today" ? `aujourd’hui ${time}` : `hier ${time}`;
}

// Read notifications, per user, in local storage.
const readListeners = new Set<() => void>();
function readKey(userId: string) {
  return `forja-notifications-read:${userId}`;
}
function loadRead(userId: string): string {
  try {
    return window.localStorage.getItem(readKey(userId)) ?? "[]";
  } catch {
    return "[]";
  }
}
function saveRead(userId: string, ids: string[]) {
  try {
    window.localStorage.setItem(readKey(userId), JSON.stringify(ids.slice(-200)));
  } catch {
    // Storage unavailable: the state lasts for this page only.
  }
  readListeners.forEach((listener) => listener());
}

function useReadIds(userId: string) {
  const raw = useSyncExternalStore(
    (listener) => {
      readListeners.add(listener);
      return () => readListeners.delete(listener);
    },
    () => loadRead(userId),
    () => "[]",
  );
  const ids = useMemo(() => new Set(JSON.parse(raw) as string[]), [raw]);
  const markRead = useCallback(
    (more: string[]) => saveRead(userId, [...ids, ...more]),
    [ids, userId],
  );
  return { ids, markRead };
}

/** Bell and popover (S2); its open state lives in the URL, ?panel=notifications. */
export function Notifications() {
  const shell = useShell();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const open = params.get("panel") === "notifications";
  const engineer = shell.role !== "analyst";
  const runs = useProjectRuns(shell.project.id, engineer);
  const conversations = useConversations(shell.project.id, shell.view === "analyst");
  const { ids: readIds, markRead } = useReadIds(shell.me.user.id);

  const items = useMemo(() => {
    const list: Notification[] = [];
    if (engineer && shell.view === "engineer") {
      const plans = shell.counters.cleaning?.count ?? 0;
      if (plans) {
        list.push({
          id: `plans:${plans}`,
          kind: "plan",
          title:
            plans > 1 ? `${plans} plans de nettoyage à revoir` : "Un plan de nettoyage à revoir",
          detail: "Règles proposées après le profilage",
          at: null,
          action: { label: "Revoir", href: sectionHref(shell.project.id, "cleaning") },
        });
      }
      if (shell.counters.model) {
        list.push({
          id: "gold:draft",
          kind: "plan",
          title: "Modèle en étoile à valider",
          detail: "Grain, clés et mesures proposés",
          at: null,
          action: { label: "Revoir", href: sectionHref(shell.project.id, "model") },
        });
      }
      const marts = shell.counters.approvals?.count ?? 0;
      if (marts) {
        list.push({
          id: `marts:${marts}`,
          kind: "mart",
          title:
            marts > 1
              ? `${marts} data marts attendent votre approbation`
              : "Un data mart attend votre approbation",
          detail: "Aperçus validés par les analysts",
          at: null,
          action: { label: "Approuver", href: sectionHref(shell.project.id, "approvals") },
        });
      }
      list.push(...runNotifications(runs.data ?? [], shell.project.id));
    } else {
      const mine = (conversations.data ?? []).filter((r) => r.owner_id === shell.me.user.id);
      list.push(...agentNotifications(mine, shell.project.id));
    }
    return list;
  }, [
    engineer,
    shell.view,
    shell.counters,
    shell.project.id,
    shell.me.user.id,
    runs.data,
    conversations.data,
  ]);

  const unread = items.filter((item) => !readIds.has(item.id));
  const groups = (["pending", "today", "yesterday"] as const)
    .map((group) => ({ group, items: items.filter((item) => dayGroup(item.at) === group) }))
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
          aria-label={unread.length ? `Notifications, ${unread.length} non lues` : "Notifications"}
          data-testid="notifications-bell"
          className="flex h-9 min-w-9 items-center justify-center gap-1.5 rounded-md border-0 bg-transparent px-2 text-tx2 transition-colors hover:bg-sunk hover:text-tx"
        >
          <Bell size={20} />
          {unread.length ? (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-[10px] bg-acc px-1.5 text-[12px] font-bold text-on-acc tabular-nums">
              {unread.length}
            </span>
          ) : null}
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="flex w-[420px] max-w-[calc(100vw-28px)] flex-col gap-0.5"
        aria-label="Notifications"
      >
        <div className="flex items-center px-2.5 pt-2 pb-1">
          <span className="text-section font-semibold">Notifications</span>
          {unread.length ? (
            <button
              type="button"
              onClick={() => markRead(unread.map((item) => item.id))}
              className="ml-auto border-0 bg-transparent p-0 text-meta font-medium text-acc-tx hover:underline"
            >
              Tout marquer comme lu
            </button>
          ) : null}
        </div>
        {groups.length === 0 ? (
          <div className="px-2.5 py-8 text-center text-[14px] text-tx3">
            Rien de nouveau pour l’instant.
          </div>
        ) : (
          groups.map(({ group, items: groupItems }) => (
            <div key={group} className="flex flex-col gap-0.5">
              <div className="px-2.5 pt-2.5 pb-1 text-[12.5px] font-semibold text-tx3">
                {GROUP_LABELS[group]}
              </div>
              {groupItems.map((item) => (
                <NotificationItem
                  key={item.id}
                  item={item}
                  unread={!readIds.has(item.id)}
                  onAct={() => {
                    markRead([item.id]);
                    setOpen(false);
                  }}
                />
              ))}
            </div>
          ))
        )}
      </PopoverContent>
    </Popover>
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
              className="size-2 flex-none rounded-full bg-acc"
            />
          ) : null}
        </div>
        <span className="truncate text-meta text-tx2">{item.detail}</span>
        <div className="mt-1.5 flex items-center gap-2.5">
          <Link
            href={item.action.href}
            onClick={onAct}
            className="flex h-[30px] items-center rounded-sm bg-node px-3 text-meta font-medium text-tx no-underline shadow-sm hover:no-underline hover:shadow-hover"
          >
            {item.action.label}
          </Link>
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
