"use client";

import { useState } from "react";
import { Broom, ChartPieSlice, Cube, FileCsv, Play, UploadSimple } from "@phosphor-icons/react";
import { Logotype, Monogram, Wordmark } from "@/components/brand/logo";
import { NotificationItem } from "@/components/shell/notifications";
import { THEME_OPTIONS } from "@/components/shell/user-menu";
import { Button } from "@/components/ui/button";
import { CheckBadge } from "@/components/ui/check-badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, Input, PasswordInput } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetBody,
  SheetCloseButton,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { HatchGlyph, Spinner } from "@/components/ui/spinner";
import { STATUS_KINDS, StatusBadge, statusTier } from "@/components/ui/status-badge";
import { Segmented, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toast";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/cn";
import { useTheme } from "@/lib/theme/use-theme";
import { COLOR_TOKENS, MOTION, RADII, SHADOWS, STATE_TOKENS, TYPE_SCALE } from "./tokens";

const ROLE_NAMES: Record<string, string> = {
  admin: "Propriétaire",
  engineer: "Engineer",
  analyst: "Analyst",
};

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="flex flex-col gap-3">
      <h2 id={`${id}-title`} className="m-0 text-section font-semibold">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("rounded-2xl bg-node p-5 shadow-sm", className)}>{children}</div>;
}

function Swatch({ token, usage }: { token: string; usage: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span
        className="h-12 rounded-[11px] shadow-[inset_0_0_0_1px_var(--hair)]"
        style={{ background: `var(${token})` }}
      />
      <span className="truncate font-mono text-mono font-medium">{token}</span>
      <span className="truncate text-[12.5px] text-tx3">{usage}</span>
    </div>
  );
}

function Tokens() {
  return (
    <>
      <Section id="couleurs" title="Couleurs">
        <Card className="grid grid-cols-4 gap-3.5 max-sm:grid-cols-2">
          {COLOR_TOKENS.map(([token, usage]) => (
            <Swatch key={token} token={token} usage={usage} />
          ))}
        </Card>
        <Card className="grid grid-cols-5 gap-3 max-sm:grid-cols-2">
          {STATE_TOKENS.map(([state, usage]) => (
            <div key={state} className="flex flex-col gap-1">
              <span
                className="flex h-12 items-center justify-center rounded-[11px] text-ui font-semibold"
                style={{
                  background: `var(--${state}-bg)`,
                  color: `var(--${state}-fg)`,
                  boxShadow: state === "prop" ? "inset 0 0 0 1px var(--prop-bd)" : undefined,
                }}
              >
                Aa
              </span>
              <span className="font-mono text-mono font-medium">--{state}-fg/bg</span>
              <span className="text-[12.5px] text-tx3">{usage}</span>
            </div>
          ))}
        </Card>
      </Section>

      <Section id="typographie" title="Instrument Sans · Commit Mono">
        <Card className="flex flex-col gap-1">
          {TYPE_SCALE.map(([label, sample, className]) => (
            <div
              key={label}
              className="grid grid-cols-[150px_1fr] items-baseline gap-3 py-1.5 max-sm:grid-cols-1"
            >
              <span className="text-[12.5px] text-tx3">{label}</span>
              <span className={cn("leading-tight", className)}>{sample}</span>
            </div>
          ))}
        </Card>
      </Section>

      <div className="grid grid-cols-2 gap-5 max-sm:grid-cols-1">
        <Section id="rayons" title="Rayons">
          <Card className="flex flex-wrap items-end gap-2.5">
            {RADII.map(([label, className]) => (
              <div key={label} className="flex flex-col items-center gap-1.5">
                <span
                  className={cn("size-10 bg-bg shadow-[inset_0_0_0_1.5px_var(--edge)]", className)}
                />
                <span className="text-[12px] text-tx3">{label}</span>
              </div>
            ))}
          </Card>
        </Section>
        <Section id="ombres" title="Ombres">
          <div className="flex flex-wrap gap-3 rounded-2xl bg-bg p-5 shadow-[inset_0_0_0_1px_var(--hair)]">
            {SHADOWS.map(([label, className]) => (
              <div key={label} className="flex flex-col items-center gap-1.5">
                <span className={cn("h-12 w-14 rounded-lg bg-node", className)} />
                <span className="text-[12px] text-tx3">{label}</span>
              </div>
            ))}
          </div>
        </Section>
      </div>

      <Section id="matieres" title="Matières translucides">
        <div className="relative grid grid-cols-3 gap-3 overflow-hidden rounded-2xl bg-cv p-5 max-sm:grid-cols-1">
          <div
            aria-hidden
            className="absolute inset-0 bg-[radial-gradient(var(--edge)_1px,transparent_1.3px)] bg-[length:12px_12px]"
          />
          <div
            aria-hidden
            className="absolute top-6 left-10 h-20 w-40 rounded-full bg-acc opacity-60"
          />
          {[
            ["material-side", "Barre latérale, flou 28"],
            ["material-glass", "Barre d’outils, flou 28"],
            ["material-glass-hi", "Menus et palette, flou 32"],
          ].map(([className, label]) => (
            <div
              key={className}
              className={cn(
                "relative flex h-24 items-end rounded-xl p-3 text-ui font-medium shadow-float",
                className,
              )}
            >
              {label}
            </div>
          ))}
        </div>
      </Section>

      <Section id="mouvement" title="Durées et ressorts">
        <Card className="flex flex-col gap-1">
          {MOTION.map(([label, value, usage]) => (
            <div
              key={label}
              className="grid grid-cols-[130px_1fr_1fr] items-baseline gap-3 py-1 text-ui max-sm:grid-cols-1"
            >
              <span className="font-semibold">{label}</span>
              <span className="font-mono text-mono text-tx2">{value}</span>
              <span className="text-tx3">{usage}</span>
            </div>
          ))}
        </Card>
      </Section>
    </>
  );
}

function Components() {
  const [segment, setSegment] = useState<"all" | "review" | "run">("all");
  const [checked, setChecked] = useState(true);
  const [role, setRole] = useState("analyst");
  return (
    <>
      <Section id="logotype" title="Logotype Strate">
        <Card className="flex flex-wrap items-center gap-7">
          <Logotype size={64} />
          <div className="flex items-center gap-3">
            <Monogram size={44} />
            <Monogram size={30} />
            <Monogram size={20} />
          </div>
          <Wordmark height={14} className="text-tx" />
        </Card>
      </Section>

      <Section id="boutons" title="Boutons">
        <Card className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary">Valider le modèle</Button>
            <Button variant="secondary">Modifier</Button>
            <Button variant="tonal">Affiner</Button>
            <Button variant="quiet">Rejeter</Button>
            <Button variant="danger">Supprimer</Button>
            <Button variant="danger-quiet">Révoquer</Button>
            <Button variant="link">Tout voir</Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary" size="sm">
              <Play size={14} weight="fill" />
              Petit
            </Button>
            <Button variant="primary" size="md">
              Moyen
            </Button>
            <Button variant="primary" size="lg">
              <Play size={14} weight="fill" />
              Lancer un run
            </Button>
            <Button variant="primary" size="xl">
              Se connecter
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary" disabled>
              Désactivé
            </Button>
            <Button variant="secondary" loading>
              Chargement
            </Button>
            <Tooltip content="Ajouter des fichiers">
              <Button variant="quiet" size="icon" aria-label="Ajouter des fichiers">
                <UploadSimple size={18} />
              </Button>
            </Tooltip>
          </div>
        </Card>
      </Section>

      <Section id="champs" title="Champs, sélecteur, case, onglets">
        <Card className="grid grid-cols-2 gap-4 max-sm:grid-cols-1">
          <Field label="Adresse e-mail">
            {({ id }) => <Input id={id} size="lg" placeholder="thomas.lefevre@exemple.fr" />}
          </Field>
          <Field label="Mot de passe">
            {({ id }) => <PasswordInput id={id} size="lg" defaultValue="un-secret-2026" />}
          </Field>
          <Field label="Formule" hint="Contour, dans les panneaux d’édition">
            {({ id, describedBy }) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                variant="outline"
                className="font-mono text-meta"
                defaultValue="sum(fct_ventes.montant_ht)"
              />
            )}
          </Field>
          <Field label="Identifiant" error="Déjà utilisé par une autre métrique.">
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                aria-invalid={invalid}
                variant="outline"
                defaultValue="chiffre_affaires"
              />
            )}
          </Field>
          <div className="flex flex-col gap-1.5">
            <span className="text-meta font-semibold text-tx2">Rôle</span>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger aria-label="Rôle" className="self-start">
                <SelectValue>{ROLE_NAMES[role]}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Propriétaire</SelectItem>
                <SelectItem value="engineer">Engineer</SelectItem>
                <SelectItem value="analyst">Analyst</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <label className="flex items-center gap-2 self-end text-ui text-tx2">
            <Checkbox checked={checked} onCheckedChange={(value) => setChecked(value === true)} />
            Rester connecté
          </label>
          <Segmented
            label="Filtre"
            value={segment}
            onValueChange={setSegment}
            options={[
              { value: "all", label: "Tout" },
              { value: "review", label: "À revoir" },
              { value: "run", label: "En cours" },
            ]}
          />
          <Tabs defaultValue="cols">
            <TabsList className="w-full">
              <TabsTrigger value="ov">Aperçu</TabsTrigger>
              <TabsTrigger value="cols">Colonnes</TabsTrigger>
              <TabsTrigger value="rules">Règles</TabsTrigger>
            </TabsList>
            <TabsContent value="ov" className="pt-2 text-ui text-tx2">
              Une ligne par client.
            </TabsContent>
            <TabsContent value="cols" className="pt-2 text-ui text-tx2">
              9 colonnes, dont 1 clé et 2 pseudonymisées.
            </TabsContent>
            <TabsContent value="rules" className="pt-2 text-ui text-tx2">
              Plan v2 appliqué.
            </TabsContent>
          </Tabs>
        </Card>
      </Section>

      <Section id="badges" title="StatusBadge et CheckBadge">
        <Card className="flex flex-col gap-4">
          {(["critical", "active", "calm"] as const).map((tier) => (
            <div
              key={tier}
              className="grid grid-cols-[110px_1fr] items-center gap-4 max-sm:grid-cols-1"
            >
              <div className="flex flex-col">
                <span className="text-[14px] font-semibold">
                  {{ critical: "Critique", active: "Actif", calm: "Calme" }[tier]}
                </span>
                <span className="text-[12.5px] text-tx3">
                  {
                    {
                      critical: "Pilule affirmée",
                      active: "Pilule teintée",
                      calm: "Icône et texte",
                    }[tier]
                  }
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-3.5">
                {STATUS_KINDS.filter((kind) => statusTier(kind) === tier).map((kind) => (
                  <StatusBadge key={kind} kind={kind} label={kind === "run" ? "62 %" : undefined} />
                ))}
              </div>
            </div>
          ))}
          <div className="flex flex-wrap gap-2 pt-1">
            <CheckBadge outcome="pass" detail="Total identique aux ventes" />
            <CheckBadge outcome="warn" selected detail="3 villes, peu de commandes" />
            <CheckBadge outcome="fail" detail="Doublons de ref_produit" />
          </div>
          <div className="flex items-center gap-3 text-ui text-tx3">
            <Spinner /> Spinner
            <span className="text-pii-fg">
              <HatchGlyph />
            </span>
            Hachure pseudonymisée
            <Kbd>⌘K</Kbd>
          </div>
        </Card>
      </Section>

      <Section id="surfaces" title="Dialogue, sheet, popover, tooltip, toast">
        <Card className="flex flex-wrap gap-2">
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="secondary">Dialogue</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Révoquer la clé « CI GitHub » ?</DialogTitle>
                <DialogDescription>La CLI et dbt ne pourront plus l’utiliser.</DialogDescription>
              </DialogHeader>
              <DialogBody className="text-body text-tx2">Cette action est définitive.</DialogBody>
              <DialogFooter>
                <Button variant="quiet">Annuler</Button>
                <Button variant="danger">Révoquer</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <InspectorDemo />
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="secondary">Popover</Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-[300px]">
              <div className="px-2.5 py-2 text-ui text-tx2">
                Matière translucide, flou 32, ombre flottante.
              </div>
            </PopoverContent>
          </Popover>
          <Tooltip content="Colonnes pseudonymisées">
            <Button variant="secondary">Tooltip</Button>
          </Tooltip>
          <Button
            variant="tonal"
            onClick={() =>
              toast.success({
                title: "Modèle validé",
                description: "Construction de fct_ventes planifiée",
              })
            }
          >
            Toast succès
          </Button>
          <Button
            variant="tonal"
            onClick={() =>
              toast.info({ title: "Profilage lancé", description: "Vous serez notifié à la fin" })
            }
          >
            Toast information
          </Button>
          <Button
            variant="tonal"
            onClick={() =>
              toast.error({
                title: "Échec du nettoyage de produits",
                description: "Colonne prix_ht introuvable",
                action: { label: "Corriger", onClick: () => undefined },
              })
            }
          >
            Toast erreur
          </Button>
        </Card>
      </Section>

      <Section id="squelette" title="Squelette et notification">
        <Card className="grid grid-cols-2 gap-4 max-sm:grid-cols-1">
          <div className="flex flex-col gap-2.5">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-16 w-full rounded-xl" />
          </div>
          <div className="rounded-xl p-1 shadow-float material-glass-hi">
            <NotificationItem
              unread
              item={{
                id: "demo",
                kind: "failure",
                title: "Échec du nettoyage de produits",
                detail: "Colonne prix_ht introuvable · run_0414",
                at: null,
                action: { label: "Corriger", href: "#squelette" },
              }}
            />
          </div>
        </Card>
      </Section>
    </>
  );
}

function InspectorDemo() {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Sheet (inspecteur)
      </Button>
      <SheetContent className="top-3">
        <SheetHeader>
          <div className="flex items-start gap-3">
            <span className="flex size-[42px] flex-none items-center justify-center rounded-lg bg-acc-soft text-acc-tx">
              <Cube size={22} weight="duotone" />
            </span>
            <div className="min-w-0 flex-1">
              <SheetTitle>dim_clients</SheetTitle>
              <SheetDescription>Dimension · 4 809 lignes</SheetDescription>
            </div>
            <SheetCloseButton />
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge kind="app" size={13} />
            <StatusBadge kind="pii" label="2 colonnes pseudonymisées" size={13} />
          </div>
        </SheetHeader>
        <SheetBody>
          {[
            ["cle_client", "Clé du modèle", Cube],
            ["clients.csv", "Source", FileCsv],
            ["clients", "Table nettoyée", Broom],
            ["Quantité par catégorie", "Data mart", ChartPieSlice],
          ].map(([name, kind, ItemIcon]) => {
            const Glyph = ItemIcon as typeof Cube;
            return (
              <div
                key={name as string}
                className="flex items-center gap-2.5 rounded-lg bg-node px-3 py-2.5 shadow-sm"
              >
                <Glyph size={18} className="text-tx2" />
                <span className="flex-1 text-[14px] font-medium">{name as string}</span>
                <span className="text-meta text-tx3">{kind as string}</span>
              </div>
            );
          })}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}

function ThemePanel({ theme, children }: { theme: "light" | "dark"; children: React.ReactNode }) {
  return (
    <div
      data-theme={theme}
      data-testid={`panel-${theme}`}
      className="flex min-w-0 flex-col gap-7 rounded-3xl bg-bg p-7 text-tx max-sm:p-4"
    >
      <div className="flex items-center gap-2 text-[14px] font-semibold">
        <span className="rounded-xs bg-sunk px-2 py-0.5 font-mono text-[12px] font-medium">
          {theme === "light" ? "Clair" : "Sombre"}
        </span>
        Recuit v2
      </div>
      {children}
    </div>
  );
}

/**
 * Internal page: every token and base component in both themes, to compare with the
 * mockups in design/. Hidden in production unless FORJA_WEB_DESIGN_SYSTEM=true.
 */
export function DesignSystem() {
  const { preference, setPreference } = useTheme();
  return (
    <main className="mx-auto flex max-w-[1520px] flex-col gap-8 px-8 py-10 max-sm:px-4">
      <header className="flex flex-wrap items-end gap-6">
        <div className="flex flex-col gap-2">
          <h1 className="m-0 text-[36px] font-semibold tracking-[-0.03em]">Design system Recuit</h1>
          <p className="m-0 text-[15px] text-tx2">
            Tokens de la planche v2 et composants de base, en clair et en sombre. Les fenêtres et
            menus suivent le thème de l’app.
          </p>
        </div>
        <Segmented
          label="Thème de l’app"
          className="ml-auto w-[300px]"
          size="sm"
          value={preference}
          onValueChange={setPreference}
          options={THEME_OPTIONS}
        />
      </header>
      <div className="grid grid-cols-2 gap-6 max-[1100px]:grid-cols-1">
        <ThemePanel theme="light">
          <Tokens />
          <Components />
        </ThemePanel>
        <ThemePanel theme="dark">
          <Tokens />
          <Components />
        </ThemePanel>
      </div>
    </main>
  );
}
