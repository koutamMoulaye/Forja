"use client";

import { useState } from "react";
import { Desktop, Keyboard, Moon, SignOut, Sun } from "@phosphor-icons/react";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/kbd";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Segmented } from "@/components/ui/tabs";
import { useTheme } from "@/lib/theme/use-theme";
import type { ThemePreference } from "@/lib/theme/theme";
import type { View } from "@/lib/session/views";
import { ROLE_LABELS, initialsOf, useShell } from "./shell-context";

export const THEME_OPTIONS = [
  { value: "light", label: "Clair", icon: <Sun size={15} /> },
  { value: "dark", label: "Sombre", icon: <Moon size={15} /> },
  { value: "system", label: "Système", icon: <Desktop size={15} /> },
] as const satisfies readonly { value: ThemePreference; label: string; icon: React.ReactNode }[];

const VIEW_OPTIONS = [
  { value: "engineer", label: "Engineer" },
  { value: "analyst", label: "Analyst" },
] as const satisfies readonly { value: View; label: string }[];

export const SHORTCUTS = [
  { keys: ["⌘", "K"], label: "Rechercher, naviguer, agir" },
  { keys: ["⇧", "⌘", "L"], label: "Basculer le thème clair ou sombre" },
  { keys: ["Échap"], label: "Fermer un panneau ou une fenêtre" },
] as const;

/** Account menu: view switch (when the role opens both), theme, shortcuts, sign out. */
export function UserMenu() {
  const shell = useShell();
  const { preference, setPreference } = useTheme();
  const [open, setOpen] = useState(false);
  const email = shell.me.user.email;
  const initials = initialsOf(email);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Compte"
          data-testid="user-menu"
          className="size-[34px] flex-none rounded-full border-0 bg-node text-[12.5px] font-semibold text-tx shadow-sm transition-shadow hover:shadow-hover"
        >
          {initials}
        </button>
      </PopoverTrigger>
      <PopoverContent className="flex w-[300px] flex-col gap-1" aria-label="Compte">
        <div className="flex items-center gap-3 px-2.5 pt-2 pb-2.5">
          <span className="flex size-[38px] flex-none items-center justify-center rounded-full bg-node text-ui font-semibold shadow-sm">
            {initials}
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-body font-semibold">{email}</span>
            <span className="text-meta text-tx3">
              {ROLE_LABELS[shell.role]} · {shell.project.name}
            </span>
          </span>
        </div>
        {shell.views.length > 1 ? (
          <>
            <div className="px-2.5 pt-0.5 text-[12.5px] font-semibold text-tx3">Vue</div>
            <Segmented
              label="Vue"
              size="sm"
              className="mx-1.5"
              value={shell.view}
              options={VIEW_OPTIONS}
              onValueChange={(view) => {
                setOpen(false);
                shell.switchView(view);
              }}
            />
          </>
        ) : null}
        <div className="px-2.5 pt-2 text-[12.5px] font-semibold text-tx3">Apparence</div>
        <Segmented
          label="Apparence"
          size="sm"
          className="mx-1.5"
          value={preference}
          options={THEME_OPTIONS}
          onValueChange={setPreference}
        />
        <div className="h-1.5" />
        <MenuButton
          icon={<Keyboard size={18} />}
          label="Raccourcis clavier"
          hint="?"
          onClick={() => {
            setOpen(false);
            shell.setShortcutsOpen(true);
          }}
        />
        <MenuButton
          icon={<SignOut size={18} />}
          label="Se déconnecter"
          onClick={() => {
            setOpen(false);
            shell.signOut();
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

function MenuButton({
  icon,
  label,
  hint,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  hint?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-[38px] items-center gap-2.5 rounded-md border-0 bg-transparent px-2.5 text-left text-[14px] text-tx transition-colors hover:bg-sunk [&_svg]:text-tx2"
    >
      {icon}
      <span className="flex-1">{label}</span>
      {hint ? <span className="text-[12.5px] text-tx3">{hint}</span> : null}
    </button>
  );
}

export function ShortcutsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(440px,calc(100vw-32px))]">
        <DialogHeader>
          <DialogTitle>Raccourcis clavier</DialogTitle>
          <DialogDescription>Sur Windows et Linux, Ctrl remplace ⌘.</DialogDescription>
        </DialogHeader>
        <DialogBody className="pb-6">
          <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
            {SHORTCUTS.map((shortcut) => (
              <li key={shortcut.label} className="flex items-center gap-3 text-[14px]">
                <span className="flex-1 text-tx2">{shortcut.label}</span>
                <span className="flex gap-1">
                  {shortcut.keys.map((key) => (
                    <Kbd key={key}>{key}</Kbd>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
