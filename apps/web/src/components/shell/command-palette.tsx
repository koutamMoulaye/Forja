"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import { Dialog as DialogPrimitive } from "radix-ui";
import {
  ArrowsLeftRight,
  Keyboard,
  LinkSimple,
  MagnifyingGlass,
  Moon,
  SignOut,
  Sun,
  type Icon,
} from "@phosphor-icons/react";
import { toast } from "@/components/ui/toast";
import { useTheme } from "@/lib/theme/use-theme";
import { NAVIGATION, SECTIONS, canOpen, sectionHref, type SectionId } from "@/lib/navigation";
import { useShell } from "./shell-context";

/** Accent and case insensitive matching: "regl" finds "Réglages". */
export function normalize(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export function paletteFilter(value: string, search: string, keywords?: string[]): number {
  const haystack = normalize([value, ...(keywords ?? [])].join(" "));
  const words = normalize(search).split(/\s+/).filter(Boolean);
  return words.every((word) => haystack.includes(word)) ? 1 : 0;
}

// Recently opened sections, per project, in local storage.
const RECENT_LIMIT = 4;
const recentListeners = new Set<() => void>();
const recentKey = (projectId: string) => `forja-recent:${projectId}`;

function loadRecent(projectId: string): string {
  try {
    return window.localStorage.getItem(recentKey(projectId)) ?? "[]";
  } catch {
    return "[]";
  }
}

export function rememberSection(projectId: string, section: SectionId) {
  try {
    const current = (JSON.parse(loadRecent(projectId)) as SectionId[]).filter(
      (id) => id !== section,
    );
    window.localStorage.setItem(
      recentKey(projectId),
      JSON.stringify([section, ...current].slice(0, RECENT_LIMIT + 1)),
    );
  } catch {
    // Storage unavailable: no recent list.
  }
  recentListeners.forEach((listener) => listener());
}

function useRecent(projectId: string): SectionId[] {
  const raw = useSyncExternalStore(
    (listener) => {
      recentListeners.add(listener);
      return () => recentListeners.delete(listener);
    },
    () => loadRecent(projectId),
    () => "[]",
  );
  return useMemo(() => (JSON.parse(raw) as SectionId[]).filter((id) => id in SECTIONS), [raw]);
}

type Entry = {
  id: string;
  label: string;
  description: string;
  icon: Icon;
  keywords?: string[];
  shortcut?: string;
  run: () => void;
};

function Item({ entry }: { entry: Entry }) {
  const EntryIcon = entry.icon;
  return (
    <Command.Item
      value={entry.id}
      keywords={[entry.label, entry.description, ...(entry.keywords ?? [])]}
      onSelect={entry.run}
      className="group flex min-h-[52px] cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 transition-colors duration-100 data-[selected=true]:bg-acc-soft"
    >
      <span className="flex size-[34px] flex-none items-center justify-center rounded-md bg-sunk text-tx2 group-data-[selected=true]:bg-node group-data-[selected=true]:text-acc-tx">
        <EntryIcon size={18} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-px text-left">
        <span className="truncate text-body font-medium text-tx">{entry.label}</span>
        <span className="truncate text-meta text-tx3">{entry.description}</span>
      </span>
      {entry.shortcut ? (
        <span className="rounded-xs bg-sunk px-[7px] py-0.5 text-[12.5px] text-tx3">
          {entry.shortcut}
        </span>
      ) : null}
    </Command.Item>
  );
}

const GROUP_HEADING =
  "[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:pb-1.5 [&_[cmdk-group-heading]]:text-[12.5px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-tx3";

/**
 * ⌘K: go to any section and run quick actions, without changing route. Searching the
 * pipeline's nodes joins in step 5b.
 */
export function CommandPalette() {
  const shell = useShell();
  const router = useRouter();
  const { resolved, setPreference } = useTheme();
  const recent = useRecent(shell.project.id);
  const [search, setSearch] = useState("");

  const close = () => shell.setPaletteOpen(false);
  const go = (section: SectionId) => {
    close();
    router.push(sectionHref(shell.project.id, section));
  };

  const sectionEntry = (id: SectionId, prefix = ""): Entry => {
    const section = SECTIONS[id];
    const view =
      section.view === "analyst" ? "Analyst" : section.view === "engineer" ? "Engineer" : "Projet";
    return {
      id: `${prefix}go:${id}`,
      label: section.label,
      description: `${view} · ${shell.project.name}`,
      icon: section.icon,
      run: () => go(id),
    };
  };

  const views = shell.views.flatMap((view) => [
    ...NAVIGATION[view].main,
    ...NAVIGATION[view].secondary,
  ]);
  const reachable = [...new Set<SectionId>([...views, "settings"])].filter((id) =>
    canOpen(shell.role, id),
  );
  const recentEntries = recent
    .filter((id) => id !== shell.section && reachable.includes(id))
    .slice(0, RECENT_LIMIT)
    .map((id) => sectionEntry(id, "recent:"));

  const actions: Entry[] = [
    {
      id: "action:theme",
      label: resolved === "dark" ? "Passer en thème clair" : "Passer en thème sombre",
      description: "Apparence",
      icon: resolved === "dark" ? Sun : Moon,
      shortcut: "⇧⌘L",
      run: () => {
        close();
        setPreference(resolved === "dark" ? "light" : "dark");
      },
    },
    ...shell.views
      .filter((view) => view !== shell.view)
      .map((view): Entry => ({
        id: `action:view:${view}`,
        label: view === "analyst" ? "Passer en vue Analyst" : "Passer en vue Engineer",
        description:
          view === "analyst"
            ? "Couches techniques et SQL masqués"
            : "Pipeline complet et SQL visibles",
        icon: ArrowsLeftRight,
        run: () => {
          close();
          shell.switchView(view);
        },
      })),
    {
      id: "action:copy-link",
      label: "Copier le lien de cette page",
      description: "Les panneaux ouverts sont dans l’adresse",
      icon: LinkSimple,
      run: () => {
        close();
        void navigator.clipboard
          ?.writeText(window.location.href)
          .then(() => toast.success({ title: "Lien copié" }))
          .catch(() => toast.error({ title: "Copie impossible" }));
      },
    },
    {
      id: "action:shortcuts",
      label: "Raccourcis clavier",
      description: "⌘K, ⇧⌘L, Échap",
      icon: Keyboard,
      run: () => {
        close();
        shell.setShortcutsOpen(true);
      },
    },
    {
      id: "action:sign-out",
      label: "Se déconnecter",
      description: shell.me.user.email,
      icon: SignOut,
      run: () => {
        close();
        shell.signOut();
      },
    },
  ];

  return (
    <Command.Dialog
      open={shell.paletteOpen}
      onOpenChange={(open) => {
        shell.setPaletteOpen(open);
        if (!open) setSearch("");
      }}
      label="Palette de commande"
      filter={paletteFilter}
      loop
      overlayClassName="fixed inset-0 z-40 bg-scrim data-[state=open]:animate-in-fade data-[state=closed]:animate-out-fade"
      contentClassName="fixed top-[104px] left-1/2 z-50 w-[min(660px,calc(100vw-32px))] -translate-x-1/2 overflow-hidden rounded-2xl text-tx shadow-float material-glass-hi outline-none data-[state=open]:animate-in-dialog data-[state=closed]:animate-out-dialog"
    >
      <DialogPrimitive.Title className="sr-only">Palette de commande</DialogPrimitive.Title>
      <DialogPrimitive.Description className="sr-only">
        Recherchez une section ou une action, puis validez avec Entrée.
      </DialogPrimitive.Description>
      <div className="flex h-[62px] items-center gap-3 px-5">
        <MagnifyingGlass size={22} className="flex-none text-tx3" />
        <Command.Input
          value={search}
          onValueChange={setSearch}
          placeholder="Rechercher une section ou une action"
          className="min-w-0 flex-1 border-0 bg-transparent text-[18px] text-tx outline-none placeholder:text-tx3"
        />
        <span className="rounded-xs bg-sunk px-[7px] py-[3px] text-[12px] text-tx3">esc</span>
      </div>
      <div className="mx-3 h-px bg-hair" />
      <Command.List className="max-h-[min(460px,60vh)] overflow-auto px-2 pt-1.5 pb-2">
        <Command.Empty className="px-3 py-7 text-center text-[14px] text-tx3">
          Aucun résultat pour « {search.trim()} »
        </Command.Empty>
        {recentEntries.length ? (
          <Command.Group heading="Récents" className={GROUP_HEADING}>
            {recentEntries.map((entry) => (
              <Item key={entry.id} entry={entry} />
            ))}
          </Command.Group>
        ) : null}
        <Command.Group heading="Aller à" className={GROUP_HEADING}>
          {reachable.map((id) => (
            <Item key={id} entry={sectionEntry(id)} />
          ))}
        </Command.Group>
        <Command.Group heading="Actions" className={GROUP_HEADING}>
          {actions.map((entry) => (
            <Item key={entry.id} entry={entry} />
          ))}
        </Command.Group>
      </Command.List>
      <div className="flex gap-4 bg-sunk px-5 py-2.5 text-[12.5px] text-tx3">
        <span>↑ ↓ naviguer</span>
        <span>↵ ouvrir</span>
        <span>esc fermer</span>
      </div>
    </Command.Dialog>
  );
}
