"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { useHealth } from "@/components/auth/auth-screen";
import { Monogram, Wordmark } from "@/components/brand/logo";
import { Tooltip } from "@/components/ui/tooltip";
import { useConversations } from "@/lib/agent/queries";
import { martBadge, martTitle, recentConversations } from "@/lib/agent/view";
import { cn } from "@/lib/cn";
import { durations, easeSoft } from "@/lib/motion";
import { NAVIGATION, SECTIONS, canOpen, sectionHref, type SectionId } from "@/lib/navigation";
import { useShell } from "./shell-context";

export const SIDEBAR_OPEN = 240;
export const SIDEBAR_RAIL = 64;
export const SIDEBAR_OVERLAY = 280;

function NavItem({ id, onNavigate }: { id: SectionId; onNavigate?: () => void }) {
  const shell = useShell();
  const section = SECTIONS[id];
  const active = shell.section === id;
  const open = shell.sidebarOpen || shell.tablet;
  const counter = section.counter ? shell.counters[section.counter] : undefined;
  const Icon = section.icon;
  const link = (
    <Link
      href={sectionHref(shell.project.id, id)}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      aria-label={open ? undefined : section.label}
      data-testid={`nav-${id}`}
      className={cn(
        "relative flex h-10 flex-none items-center rounded-[11px] text-body no-underline transition-colors duration-150 hover:no-underline",
        open ? "w-full justify-start gap-[11px] px-2.5" : "w-10 justify-center",
        active
          ? "bg-sunk font-semibold text-tx"
          : "font-medium text-tx2 hover:bg-sunk hover:text-tx",
      )}
    >
      <Icon
        size={20}
        weight={active ? "duotone" : "regular"}
        className={cn("flex-none", active ? "text-acc-tx" : "text-tx2")}
      />
      {open ? (
        <>
          <span className="flex-1 truncate text-left">{section.label}</span>
          {counter ? (
            <span
              aria-label={`${counter.count} à revoir`}
              className={cn(
                "flex h-[22px] min-w-[22px] items-center justify-center rounded-[11px] px-[7px] text-[12.5px] font-semibold",
                counter.tone === "run" ? "bg-run-bg text-run-fg" : "bg-prop-bg text-prop-fg",
              )}
            >
              {counter.count}
            </span>
          ) : null}
        </>
      ) : counter ? (
        <span
          aria-label={`${counter.count} à revoir`}
          className={cn(
            "absolute top-2 right-2 size-[7px] rounded-full",
            counter.tone === "run" ? "bg-run-fg" : "bg-prop-fg",
          )}
        />
      ) : null}
    </Link>
  );
  return open ? (
    link
  ) : (
    <Tooltip content={section.label} side="right">
      {link}
    </Tooltip>
  );
}

/** Analyst view: the latest conversations under the navigation, to pick one up (C4). */
function RecentConversations({ onNavigate }: { onNavigate?: () => void }) {
  const shell = useShell();
  const pathname = usePathname();
  const conversations = useConversations(shell.project.id);
  const mine = (conversations.data ?? []).filter((r) => r.owner_id === shell.me.user.id);
  const recent = recentConversations(mine, 6);
  if (recent.length === 0) return null;
  return (
    <div className="flex min-h-0 flex-col gap-0.5 px-3 pt-3" data-testid="recent-conversations">
      <div className="px-2.5 pb-1 text-[12.5px] font-semibold text-tx3">Récemment</div>
      <div className="flex min-h-0 flex-col gap-0.5 overflow-auto">
        {recent.map((request) => {
          const href = `/projects/${shell.project.id}/ask/${request.id}`;
          const active = pathname === href;
          const badge = martBadge(request);
          return (
            <Link
              key={request.id}
              href={href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex flex-col gap-px rounded-[10px] px-2.5 py-2 text-tx no-underline transition-colors hover:bg-sunk hover:no-underline",
                active && "bg-sunk",
              )}
            >
              <span className="truncate text-[13.5px] font-medium">{martTitle(request)}</span>
              <span className="truncate text-[12px] text-tx3">{badge.label}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const shell = useShell();
  const open = shell.sidebarOpen || shell.tablet;
  const groups = NAVIGATION[shell.view];
  const visible = (ids: SectionId[]) => ids.filter((id) => canOpen(shell.role, id));
  const local = shell.me.auth_mode !== "multi";
  const version = useHealth().data?.version;
  return (
    <>
      <div className="flex h-14 flex-none items-center gap-2.5 px-[17px]">
        <Monogram size={30} title={open ? undefined : "Forja"} />
        {open ? <Wordmark height={13.7} className="text-tx" /> : null}
      </div>
      <nav
        aria-label="Navigation du projet"
        className={cn("flex flex-col gap-0.5 px-3 py-2", open ? "items-stretch" : "items-center")}
      >
        {visible(groups.main).map((id) => (
          <NavItem key={id} id={id} onNavigate={onNavigate} />
        ))}
        {groups.secondary.length ? <span aria-hidden className="h-3.5" /> : null}
        {visible(groups.secondary).map((id) => (
          <NavItem key={id} id={id} onNavigate={onNavigate} />
        ))}
      </nav>
      {open && shell.view === "analyst" ? <RecentConversations onNavigate={onNavigate} /> : null}
      <div
        className={cn("mt-auto flex flex-col gap-2 p-3", open ? "items-stretch" : "items-center")}
      >
        {canOpen(shell.role, "settings") ? <NavItem id="settings" onNavigate={onNavigate} /> : null}
        <div
          className={cn(
            "flex items-center gap-2 py-1.5 text-[12.5px] text-tx3",
            open ? "justify-start px-2.5" : "justify-center",
          )}
          title={local ? "Poste local" : "Instance partagée"}
        >
          <span className="size-[7px] flex-none rounded-full bg-val-fg" />
          {open ? (
            <span className="whitespace-nowrap">
              {local ? "Poste local" : "Instance partagée"}
              {version ? ` · v${version}` : ""}
            </span>
          ) : null}
        </div>
      </div>
    </>
  );
}

/**
 * The translucent sidebar: open (240), folded to a rail (64), or an overlay (280) on
 * tablets. Folded by default on the canvas.
 */
export function Sidebar() {
  const shell = useShell();
  if (shell.tablet) {
    return (
      <AnimatePresence>
        {shell.sidebarOpen ? (
          <>
            <motion.div
              key="scrim"
              className="fixed inset-0 z-20 bg-scrim"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => shell.setSidebarOpen(false)}
            />
            <motion.aside
              key="overlay"
              aria-label="Barre latérale"
              className="fixed inset-y-0 left-0 z-30 flex flex-col overflow-hidden shadow-float material-side"
              style={{ width: SIDEBAR_OVERLAY }}
              initial={{ x: -SIDEBAR_OVERLAY }}
              animate={{ x: 0 }}
              exit={{ x: -SIDEBAR_OVERLAY }}
              transition={{ duration: durations.layout, ease: easeSoft }}
            >
              <SidebarContent onNavigate={() => shell.setSidebarOpen(false)} />
            </motion.aside>
          </>
        ) : null}
      </AnimatePresence>
    );
  }
  return (
    <aside
      aria-label="Barre latérale"
      data-state={shell.sidebarOpen ? "open" : "rail"}
      className={cn(
        "absolute inset-y-0 left-0 z-10 flex flex-col overflow-hidden material-side",
        "transition-[width] duration-(--dur-layout) ease-soft",
        shell.canvas ? "shadow-float" : "shadow-[0.5px_0_0_var(--hair)]",
      )}
      style={{ width: shell.sidebarOpen ? SIDEBAR_OPEN : SIDEBAR_RAIL }}
    >
      <SidebarContent />
    </aside>
  );
}
