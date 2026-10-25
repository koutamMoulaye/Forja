"use client";

import { Fragment, useState } from "react";
import {
  CaretRight,
  CaretUpDown,
  Check,
  MagnifyingGlass,
  SidebarSimple,
} from "@phosphor-icons/react";
import { Kbd } from "@/components/ui/kbd";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/cn";
import { breadcrumb } from "@/lib/navigation";
import { roleIn } from "@/lib/session/views";
import { Notifications } from "./notifications";
import { RunStatus } from "./run-status";
import { ROLE_LABELS, useShell } from "./shell-context";
import { UserMenu } from "./user-menu";

function ProjectSelector() {
  const shell = useShell();
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid="project-selector"
          className="flex h-9 min-w-0 items-center gap-1.5 rounded-md border-0 bg-transparent px-2.5 text-body font-semibold whitespace-nowrap text-tx transition-colors hover:bg-sunk"
        >
          <span className="truncate">{shell.project.name}</span>
          <CaretUpDown size={14} className="flex-none text-tx3" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="flex w-[300px] flex-col gap-0.5"
        aria-label="Projets"
      >
        <div className="px-2.5 pt-2 pb-1 text-[12.5px] font-semibold text-tx3">Projets</div>
        {shell.projects.map((project) => {
          const role = roleIn(shell.me, project.id);
          const current = project.id === shell.project.id;
          return (
            <button
              key={project.id}
              type="button"
              onClick={() => {
                setOpen(false);
                if (!current) shell.switchProject(project.id);
              }}
              className={cn(
                "flex min-h-[46px] items-center gap-2.5 rounded-md border-0 px-2.5 py-1.5 text-left transition-colors",
                current ? "bg-acc-soft" : "bg-transparent hover:bg-sunk",
              )}
            >
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[14px] font-medium text-tx">{project.name}</span>
                <span className="truncate text-[12.5px] text-tx3">
                  {role ? ROLE_LABELS[role] : ""}
                  {project.description ? ` · ${project.description}` : ""}
                </span>
              </span>
              {current ? <Check size={15} weight="bold" className="flex-none text-acc-tx" /> : null}
            </button>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}

function SearchButton() {
  const shell = useShell();
  if (shell.tablet) {
    return (
      <Tooltip content="Rechercher (⌘K)">
        <button
          type="button"
          aria-label="Rechercher"
          onClick={() => shell.setPaletteOpen(true)}
          className="flex size-9 items-center justify-center rounded-md border-0 bg-sunk text-tx3 transition-colors hover:text-tx2"
        >
          <MagnifyingGlass size={17} />
        </button>
      </Tooltip>
    );
  }
  return (
    <button
      type="button"
      onClick={() => shell.setPaletteOpen(true)}
      data-testid="search-button"
      className="flex h-9 w-[240px] items-center gap-2 rounded-md border-0 bg-sunk pr-2 pl-3 text-[14px] text-tx3 transition-colors hover:text-tx2"
    >
      <MagnifyingGlass size={17} />
      <span className="flex-1 text-left">Rechercher</span>
      <Kbd className="bg-node shadow-sm">⌘K</Kbd>
    </button>
  );
}

/**
 * Project, breadcrumb, search, run in progress, notifications and account. Transparent
 * over the canvas, opaque elsewhere.
 */
export function TopBar() {
  const shell = useShell();
  const crumbs = breadcrumb(shell.section, shell.rest);
  return (
    <header
      className={cn(
        "absolute top-0 right-0 z-[9] flex h-14 items-center gap-1.5 pr-3.5 pl-3",
        "transition-[left] duration-(--dur-layout) ease-soft",
        shell.canvas ? "bg-transparent" : "bg-bg",
      )}
      style={{ left: "var(--shell-left)" }}
    >
      <Tooltip
        content={shell.sidebarOpen ? "Replier la barre latérale" : "Déplier la barre latérale"}
      >
        <button
          type="button"
          aria-label="Barre latérale"
          aria-expanded={shell.sidebarOpen}
          data-testid="sidebar-toggle"
          onClick={() => shell.setSidebarOpen(!shell.sidebarOpen)}
          className="flex size-9 flex-none items-center justify-center rounded-md border-0 bg-transparent text-tx2 transition-colors hover:bg-sunk hover:text-tx"
        >
          <SidebarSimple size={20} />
        </button>
      </Tooltip>
      <ProjectSelector />
      <nav aria-label="Fil d’Ariane" className="hidden min-w-0 items-center sm:flex">
        {crumbs.map((crumb, index) => (
          <Fragment key={`${crumb}-${index}`}>
            <CaretRight size={13} className="flex-none text-tx3" aria-hidden />
            <span
              aria-current={index === crumbs.length - 1 ? "page" : undefined}
              className={cn(
                "truncate px-1 text-body whitespace-nowrap",
                index === crumbs.length - 1 ? "font-medium text-tx" : "text-tx3",
              )}
            >
              {crumb}
            </span>
          </Fragment>
        ))}
      </nav>
      <div className="ml-auto flex items-center gap-2">
        <SearchButton />
        <RunStatus />
        <Notifications />
        <UserMenu />
      </div>
    </header>
  );
}
