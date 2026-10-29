"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Cloud,
  Copy,
  Cpu,
  EnvelopeSimple,
  Key,
  Plus,
  Prohibit,
  UserPlus,
  WarningCircle,
} from "@phosphor-icons/react";
import {
  Card,
  ScreenBody,
  ScreenError,
  ScreenHeader,
  SectionTitle,
} from "@/components/screens/screen";
import { initialsOf, ROLE_LABELS, useShell } from "@/components/shell/shell-context";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { Segmented } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toast";
import { api, unwrap } from "@/lib/api/client";
import { ApiError } from "@/lib/api/errors";
import { ConnectorHosts } from "./connector-hosts";
import { cn } from "@/lib/cn";
import { invitationLink } from "@/lib/auth/invitation";
import { formatAgo, formatDateTime, formatWhen } from "@/lib/format";
import {
  keys,
  useApiKeys,
  useInvitations,
  useLlmSettings,
  useMembers,
  type CreatedApiKey,
  type Invitation,
  type LLMConfigView,
} from "@/lib/project/queries";
import type { Role } from "@/lib/session/views";

type Tab = "members" | "ai" | "connectors" | "api-keys";

function failure(title: string) {
  return (error: unknown) =>
    toast.error({
      title,
      description: error instanceof ApiError ? error.message : "Réessayez dans un instant.",
    });
}

/** /projects/[id]/settings (S6): members, invitations, AI provider, connectors, API keys. */
export function SettingsScreen() {
  const { project } = useShell();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const tab = (params.get("tab") as Tab | null) ?? "members";
  useEffect(() => {
    if (params.get("tab"))
      document
        .getElementById(`settings-${tab}`)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);
  return (
    <ScreenBody testId="settings-screen">
      <ScreenHeader
        title="Réglages du projet"
        subtitle={`${project.name} · poste local`}
        actions={
          <Segmented<Tab>
            label="Section des réglages"
            value={tab}
            onValueChange={(next) => router.replace(`${pathname}?tab=${next}`, { scroll: false })}
            options={[
              { value: "members", label: "Membres" },
              { value: "ai", label: "Fournisseur IA" },
              { value: "connectors", label: "Connecteurs" },
              { value: "api-keys", label: "Clés API" },
            ]}
          />
        }
      />
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <div className="flex scroll-mt-4 flex-col gap-5" id="settings-members">
          <Members highlighted={tab === "members"} />
        </div>
        <div className="flex flex-col gap-5">
          <div id="settings-ai" className="scroll-mt-4">
            <Provider highlighted={tab === "ai"} />
          </div>
          <div id="settings-connectors" className="scroll-mt-4">
            <ConnectorHosts className={ring(tab === "connectors")} />
          </div>
          <div id="settings-api-keys" className="scroll-mt-4">
            <ApiKeys highlighted={tab === "api-keys"} />
          </div>
        </div>
      </div>
    </ScreenBody>
  );
}

function ring(on: boolean) {
  return cn("transition-shadow duration-300", on && "shadow-[0_0_0_2px_var(--acc),var(--sh-sm)]");
}

const ROLES: Role[] = ["admin", "engineer", "analyst"];

function Members({ highlighted }: { highlighted: boolean }) {
  const { project, me } = useShell();
  const queryClient = useQueryClient();
  const members = useMembers(project.id);
  const multi = me.auth_mode === "multi";
  const invitations = useInvitations(project.id, multi);
  const [inviting, setInviting] = useState(false);
  const [created, setCreated] = useState<Invitation | null>(null);
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: keys.members(project.id) });
    void queryClient.invalidateQueries({ queryKey: keys.invitations(project.id) });
  };
  const setRole = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: Role }) =>
      unwrap(
        await api.PUT("/projects/{project_id}/members/{user_id}", {
          params: { path: { project_id: project.id, user_id: userId } },
          body: { role },
        }),
      ),
    onSuccess: (m) => {
      toast.success({ title: "Rôle modifié", description: `${m.email} : ${ROLE_LABELS[m.role]}` });
      refresh();
    },
    onError: failure("Rôle non modifié"),
  });
  const invite = useMutation({
    mutationFn: async (body: { email: string; role: Role }) =>
      unwrap(
        await api.POST("/projects/{project_id}/invitations", {
          params: { path: { project_id: project.id } },
          body,
        }),
      ),
    onSuccess: (invitation) => {
      setInviting(false);
      if (invitation.token) setCreated(invitation);
      else toast.success({ title: "Membre ajouté", description: invitation.email });
      refresh();
    },
    onError: failure("Invitation refusée"),
  });
  const revoke = useMutation({
    mutationFn: async (invitation: Invitation) => {
      unwrap(
        await api.DELETE("/projects/{project_id}/invitations/{invitation_id}", {
          params: { path: { project_id: project.id, invitation_id: invitation.id } },
        }),
      );
      return invitation;
    },
    onSuccess: (invitation) => {
      toast.success({ title: "Invitation révoquée", description: invitation.email });
      refresh();
    },
    onError: failure("Invitation non révoquée"),
  });
  const resend = async (invitation: Invitation) => {
    await revoke.mutateAsync(invitation);
    invite.mutate({ email: invitation.email, role: invitation.role });
  };
  const pending = (invitations.data ?? []).filter((i) => !i.accepted_at);

  return (
    <>
      <Card
        className={cn("flex flex-col gap-1 px-5 py-[18px]", ring(highlighted))}
        data-testid="members"
      >
        <SectionTitle
          count={members.data?.length}
          className="pb-2"
          action={
            multi ? (
              <Button variant="primary" size="md" onClick={() => setInviting(true)}>
                <UserPlus size={16} />
                Inviter
              </Button>
            ) : null
          }
        >
          Membres
        </SectionTitle>
        {members.isPending ? <Skeleton className="h-28 w-full rounded-lg" /> : null}
        {members.isError ? (
          <ScreenError error={members.error} onRetry={() => void members.refetch()} />
        ) : null}
        {(members.data ?? []).map((member) => (
          <div key={member.user_id} className="flex items-center gap-3 py-2.5">
            <span className="flex size-9 flex-none items-center justify-center rounded-full bg-sunk text-[12.5px] font-semibold">
              {initialsOf(member.email || "?")}
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-[14.5px] font-medium">
                {member.email}
                {member.user_id === me.user.id ? <span className="text-tx3"> (vous)</span> : null}
              </span>
              <span className="text-meta text-tx3">
                Membre depuis {formatWhen(member.created_at).toLowerCase()}
              </span>
            </span>
            <Select
              value={member.role}
              disabled={member.user_id === me.user.id || setRole.isPending}
              onValueChange={(role) =>
                setRole.mutate({ userId: member.user_id, role: role as Role })
              }
            >
              <SelectTrigger aria-label={`Rôle de ${member.email}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLES.map((role) => (
                  <SelectItem key={role} value={role}>
                    {ROLE_LABELS[role]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
        {!multi ? (
          <p className="m-0 pt-2 text-meta text-tx3">
            Mode local : un seul administrateur. Les invitations demandent FORJA_AUTH_MODE=multi.
          </p>
        ) : null}
      </Card>
      {multi ? (
        <Card className="flex flex-col gap-1 px-5 py-[18px]" data-testid="invitations">
          <SectionTitle className="pb-2">Invitations en attente</SectionTitle>
          {pending.length === 0 ? (
            <p className="m-0 py-2 text-ui text-tx3">Aucune invitation en attente.</p>
          ) : null}
          {pending.map((invitation) => (
            <div
              key={invitation.id}
              data-testid={`invitation-${invitation.email}`}
              className="flex items-center gap-3 py-2.5"
            >
              <span className="flex size-9 flex-none items-center justify-center rounded-full text-tx3 shadow-[inset_0_0_0_1.5px_var(--edge)]">
                <EnvelopeSimple size={17} />
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[14.5px] font-medium">{invitation.email}</span>
                <span className="text-meta text-tx3">
                  {ROLE_LABELS[invitation.role]} · envoyée {formatAgo(invitation.created_at)}
                </span>
              </span>
              <Button
                variant="quiet"
                size="sm"
                disabled={revoke.isPending || invite.isPending}
                onClick={() => void resend(invitation)}
              >
                Renvoyer
              </Button>
              <Button
                variant="danger-quiet"
                size="sm"
                disabled={revoke.isPending}
                onClick={() => revoke.mutate(invitation)}
              >
                Révoquer
              </Button>
            </div>
          ))}
        </Card>
      ) : null}
      <InviteDialog
        open={inviting}
        onOpenChange={setInviting}
        saving={invite.isPending}
        onInvite={(email, role) => invite.mutate({ email, role })}
      />
      <SecretDialog
        open={created !== null}
        onOpenChange={(open) => !open && setCreated(null)}
        title="Invitation créée"
        description={`Envoyez ce lien à ${created?.email ?? ""} : il lui permet de créer son compte${
          created ? ` jusqu’au ${formatDateTime(created.expires_at)}` : ""
        }. Il ne sera plus affiché.`}
        secret={created?.token ? invitationLink(created.token) : ""}
      />
    </>
  );
}

function InviteDialog({
  open,
  onOpenChange,
  saving,
  onInvite,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  saving: boolean;
  onInvite: (email: string, role: Role) => void;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("analyst");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Inviter dans le projet</DialogTitle>
          <DialogDescription>
            Un compte existant est ajouté tout de suite ; sinon, un lien d’inscription est créé.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-3">
          <Field label="Adresse e-mail">
            {({ id }) => (
              <Input
                id={id}
                type="email"
                variant="outline"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            )}
          </Field>
          <Field label="Rôle">
            {({ id }) => (
              <Select value={role} onValueChange={(v) => setRole(v as Role)}>
                <SelectTrigger id={id} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="quiet" size="lg" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button
            variant="primary"
            size="lg"
            loading={saving}
            disabled={!email.includes("@")}
            onClick={() => onInvite(email.trim(), role)}
          >
            Inviter
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SecretDialog({
  open,
  onOpenChange,
  title,
  description,
  secret,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  secret: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) setCopied(false);
      }}
    >
      <DialogContent data-testid="secret-dialog">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-3">
          <div className="flex items-center gap-2 rounded-lg bg-sunk p-3">
            <code
              data-testid="secret-value"
              className="min-w-0 flex-1 font-mono text-[13px] break-all"
            >
              {secret}
            </code>
            <Button
              variant="secondary"
              size="md"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(secret);
                  setCopied(true);
                } catch {
                  toast.error({
                    title: "Copie impossible",
                    description: "Sélectionnez le texte à la main",
                  });
                }
              }}
            >
              <Copy size={15} />
              {copied ? "Copié" : "Copier"}
            </Button>
          </div>
          <p className="m-0 flex items-start gap-2 text-meta text-prop-fg">
            <WarningCircle size={16} weight="fill" className="mt-px flex-none" />
            Affiché une seule fois : Forja n’en garde qu’une empreinte.
          </p>
        </DialogBody>
        <DialogFooter>
          <Button variant="primary" size="lg" onClick={() => onOpenChange(false)}>
            J’ai conservé la valeur
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type ProviderChoice = LLMConfigView["provider"];

const PROVIDERS: {
  value: ProviderChoice;
  label: string;
  description: string;
  icon: typeof Cpu;
}[] = [
  {
    value: "ollama",
    label: "IA locale, Ollama",
    description: "Sur ce poste, aucune donnée ne sort",
    icon: Cpu,
  },
  { value: "anthropic", label: "Anthropic", description: "Claude, via votre clé API", icon: Cloud },
  { value: "openai", label: "OpenAI", description: "GPT, via votre clé API", icon: Cloud },
  { value: "none", label: "Aucun", description: "Heuristiques seules, sans IA", icon: Prohibit },
];

function Provider({ highlighted }: { highlighted: boolean }) {
  const settings = useLlmSettings();
  return (
    <Card
      className={cn("flex flex-col gap-2.5 px-5 py-[18px]", ring(highlighted))}
      data-testid="provider"
    >
      <div className="flex flex-col gap-0.5">
        <h2 className="m-0 text-section font-semibold">Fournisseur IA</h2>
        <span className="text-ui text-tx2">
          Utilisé pour les plans de nettoyage, le modèle et l’agent métier.
        </span>
      </div>
      {settings.isPending ? <Skeleton className="h-60 w-full rounded-xl" /> : null}
      {settings.isError ? (
        <ScreenError error={settings.error} onRetry={() => void settings.refetch()} />
      ) : null}
      {settings.data ? (
        <ProviderForm
          key={`${settings.data.provider}-${settings.data.model}`}
          view={settings.data}
        />
      ) : null}
    </Card>
  );
}

function ProviderForm({ view }: { view: LLMConfigView }) {
  const queryClient = useQueryClient();
  const [choice, setChoice] = useState<ProviderChoice>(view.provider);
  const [model, setModel] = useState(view.provider === choice ? (view.model ?? "") : "");
  const [address, setAddress] = useState(view.ollama_base_url);
  const [key, setKey] = useState("");
  const current = choice === view.provider;
  const keySet =
    choice === "anthropic" ? view.keys.anthropic : choice === "openai" ? view.keys.openai : false;
  const save = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.PUT("/settings/llm", {
          body: {
            provider: choice,
            model: model.trim() || null,
            ollama_base_url: choice === "ollama" ? address.trim() || null : null,
            api_key: key.trim() || null,
          },
        }),
      ),
    onSuccess: (saved) => {
      setKey("");
      queryClient.setQueryData(keys.llm(), saved);
      toast.success({
        title: "Fournisseur IA enregistré",
        description: saved.provider === "none" ? "Heuristiques seules" : `${saved.model ?? ""}`,
      });
    },
    onError: failure("Réglage refusé"),
  });
  const test = useMutation({
    mutationFn: async () => unwrap(await api.POST("/settings/llm/test")),
    onSuccess: (check) => {
      void queryClient.invalidateQueries({ queryKey: keys.llm() });
      if (check.ok)
        toast.success({
          title: "Connexion réussie",
          description: `${check.message} ${check.duration_ms} ms`,
        });
      else toast.error({ title: "Connexion impossible", description: check.message });
    },
    onError: failure("Test impossible"),
  });
  const dirty =
    !current ||
    (model.trim() || null) !== (view.model ?? null) ||
    (choice === "ollama" && address.trim() !== view.ollama_base_url) ||
    key.trim() !== "";
  const check = current ? view.last_check : null;
  const field = "flex min-h-9 items-center gap-3 text-ui";

  return (
    <div className="flex flex-col gap-2.5">
      <div role="radiogroup" aria-label="Fournisseur IA" className="flex flex-col gap-2">
        {PROVIDERS.map((provider) => {
          const on = choice === provider.value;
          const status =
            provider.value === view.provider
              ? check?.ok === false
                ? { kind: "err" as const, label: "Injoignable" }
                : provider.value === "none"
                  ? null
                  : { kind: "val" as const, label: check?.ok ? "Connecté" : "Actif" }
              : provider.value === "anthropic" && !view.keys.anthropic
                ? { kind: "queue" as const, label: "Non configuré" }
                : provider.value === "openai" && !view.keys.openai
                  ? { kind: "queue" as const, label: "Non configuré" }
                  : null;
          return (
            <button
              key={provider.value}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={!view.editable}
              onClick={() => {
                setChoice(provider.value);
                setModel(provider.value === view.provider ? (view.model ?? "") : "");
              }}
              className={cn(
                "flex min-h-[60px] items-center gap-3 rounded-[14px] border-0 px-3 py-2.5 text-left font-sans text-tx transition-[background-color,box-shadow] duration-200",
                on
                  ? "bg-acc-soft shadow-[inset_0_0_0_1.5px_var(--acc)]"
                  : "bg-transparent shadow-[inset_0_0_0_1px_var(--hair)]",
                !view.editable && "cursor-not-allowed opacity-80",
              )}
            >
              <span
                className={cn(
                  "size-[18px] flex-none rounded-full bg-node transition-shadow duration-250",
                  on
                    ? "shadow-[inset_0_0_0_5px_var(--acc)]"
                    : "shadow-[inset_0_0_0_1.5px_var(--edge)]",
                )}
              />
              <span className="flex size-9 flex-none items-center justify-center rounded-md bg-sunk text-tx2">
                <provider.icon size={19} />
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-[14.5px] font-semibold">{provider.label}</span>
                <span className="text-meta text-tx3">{provider.description}</span>
              </span>
              {status ? <StatusBadge kind={status.kind} label={status.label} size={12.5} /> : null}
            </button>
          );
        })}
      </div>
      <div className="flex flex-col gap-2.5 rounded-[14px] bg-sunk p-3.5">
        {choice !== "none" ? (
          <label className={field}>
            <span className="w-[110px] flex-none text-tx3">Modèle</span>
            <Input
              variant="outline"
              className="h-9 font-mono text-[13px]"
              placeholder={
                view.default_model && choice === view.provider
                  ? view.default_model
                  : "par défaut du fournisseur"
              }
              aria-label="Modèle"
              value={model}
              disabled={!view.editable}
              onChange={(e) => setModel(e.target.value)}
            />
          </label>
        ) : null}
        {choice === "ollama" ? (
          <label className={field}>
            <span className="w-[110px] flex-none text-tx3">Adresse</span>
            <Input
              variant="outline"
              className="h-9 font-mono text-[13px]"
              aria-label="Adresse d’Ollama"
              value={address}
              disabled={!view.editable}
              onChange={(e) => setAddress(e.target.value)}
            />
          </label>
        ) : null}
        {choice === "anthropic" || choice === "openai" ? (
          <label className={field}>
            <span className="w-[110px] flex-none text-tx3">Clé API</span>
            <Input
              variant="outline"
              type="password"
              autoComplete="off"
              className="h-9 font-mono text-[13px]"
              placeholder={keySet ? "Enregistrée · saisir pour remplacer" : "Non renseignée"}
              aria-label="Clé API"
              value={key}
              disabled={!view.editable}
              onChange={(e) => setKey(e.target.value)}
            />
          </label>
        ) : null}
        {choice === "none" ? (
          <div className={field}>
            <span className="w-[110px] flex-none text-tx3">Plans</span>
            <span className="font-medium">Heuristiques</span>
          </div>
        ) : null}
        {current && choice !== "none" ? (
          <div className={field}>
            <span className="w-[110px] flex-none text-tx3">Dernier test</span>
            <span
              className={cn("font-medium", check && !check.ok && "text-err-fg")}
              data-testid="last-check"
            >
              {check
                ? `${formatAgo(check.checked_at)}, ${check.ok ? `${(check.duration_ms / 1000).toFixed(1).replace(".", ",")} s` : check.message}`
                : "Jamais"}
            </span>
          </div>
        ) : null}
        <span className="text-meta leading-[1.45] text-tx2">
          {choice === "ollama"
            ? "Les fichiers et leurs valeurs restent sur ce poste."
            : choice === "none"
              ? "Les règles de nettoyage et le modèle seront proposés sans IA ; l’agent métier reste limité aux questions simples."
              : "Envoyés : schémas et échantillons pseudonymisés, jamais les fichiers complets. La clé reste sur ce poste, hors du dépôt."}
          {view.source === "environment" && current
            ? " Réglage actuel lu dans les variables FORJA_LLM_*."
            : ""}
        </span>
        {view.editable ? (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="primary"
              size="md"
              disabled={!dirty}
              loading={save.isPending}
              onClick={() => save.mutate()}
            >
              Enregistrer
            </Button>
            <Button
              variant="secondary"
              size="md"
              disabled={!current || dirty}
              loading={test.isPending}
              onClick={() => test.mutate()}
            >
              Tester la connexion
            </Button>
          </div>
        ) : (
          <span className="text-meta text-tx3">Réservé à l’administrateur de l’instance.</span>
        )}
      </div>
    </div>
  );
}

function ApiKeys({ highlighted }: { highlighted: boolean }) {
  const queryClient = useQueryClient();
  const list = useApiKeys();
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const [created, setCreated] = useState<CreatedApiKey | null>(null);
  const [revoking, setRevoking] = useState<{ id: string; name: string } | null>(null);
  const create = useMutation({
    mutationFn: async () =>
      unwrap(await api.POST("/auth/api-keys", { body: { name: name.trim() } })),
    onSuccess: (key) => {
      setNaming(false);
      setName("");
      setCreated(key);
      void queryClient.invalidateQueries({ queryKey: keys.apiKeys() });
    },
    onError: failure("Clé non créée"),
  });
  const revoke = useMutation({
    mutationFn: async (id: string) =>
      unwrap(await api.DELETE("/auth/api-keys/{key_id}", { params: { path: { key_id: id } } })),
    onSuccess: (key) => {
      setRevoking(null);
      toast.success({ title: "Clé révoquée", description: key.name });
      void queryClient.invalidateQueries({ queryKey: keys.apiKeys() });
    },
    onError: failure("Clé non révoquée"),
  });
  const active = (list.data ?? []).filter((k) => !k.revoked_at);
  return (
    <Card
      className={cn("flex flex-col gap-1 px-5 py-[18px]", ring(highlighted))}
      data-testid="api-keys"
    >
      <SectionTitle
        className="pb-1.5"
        action={
          <Button variant="tonal" size="md" onClick={() => setNaming(true)}>
            <Plus size={14} />
            Créer une clé
          </Button>
        }
      >
        Clés API personnelles
      </SectionTitle>
      <span className="pb-1.5 text-ui text-tx2">
        Pour la CLI, dbt et l’API de Forja. Visible une seule fois à la création.
      </span>
      {list.isPending ? <Skeleton className="h-16 w-full rounded-lg" /> : null}
      {!list.isPending && active.length === 0 ? (
        <p className="m-0 py-2 text-ui text-tx3">Aucune clé active.</p>
      ) : null}
      {active.map((key) => (
        <div
          key={key.id}
          className="flex items-center gap-3 py-2.5"
          data-testid={`api-key-${key.name}`}
        >
          <Key size={20} className="flex-none text-tx3" />
          <span className="flex min-w-0 flex-1 flex-col gap-px">
            <span className="truncate text-[14.5px] font-medium">{key.name}</span>
            <span className="truncate font-mono text-[12.5px] text-tx3">
              {key.prefix}… ·{" "}
              {key.last_used_at ? `utilisée ${formatAgo(key.last_used_at)}` : "jamais utilisée"}
            </span>
          </span>
          <Button
            variant="danger-quiet"
            size="sm"
            onClick={() => setRevoking({ id: key.id, name: key.name })}
          >
            Révoquer
          </Button>
        </div>
      ))}
      <Dialog open={naming} onOpenChange={setNaming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Créer une clé API</DialogTitle>
            <DialogDescription>
              Elle agit avec vos rôles. Nommez-la d’après son usage.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Field label="Nom de la clé">
              {({ id }) => (
                <Input
                  id={id}
                  variant="outline"
                  placeholder="CI GitHub, poste de travail…"
                  value={name}
                  maxLength={100}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && name.trim()) create.mutate();
                  }}
                />
              )}
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button variant="quiet" size="lg" onClick={() => setNaming(false)}>
              Annuler
            </Button>
            <Button
              variant="primary"
              size="lg"
              disabled={!name.trim()}
              loading={create.isPending}
              onClick={() => create.mutate()}
            >
              Créer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <SecretDialog
        open={created !== null}
        onOpenChange={(open) => !open && setCreated(null)}
        title={`Clé « ${created?.name ?? ""} » créée`}
        description="Copiez-la maintenant et gardez-la dans un coffre : à envoyer dans l’en-tête X-API-Key."
        secret={created?.key ?? ""}
      />
      <Dialog open={revoking !== null} onOpenChange={(open) => !open && setRevoking(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Révoquer « {revoking?.name} » ?</DialogTitle>
            <DialogDescription>
              Les outils qui l’utilisent perdront l’accès immédiatement.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="quiet" size="lg" onClick={() => setRevoking(null)}>
              Annuler
            </Button>
            <Button
              variant="danger"
              size="lg"
              loading={revoke.isPending}
              onClick={() => revoking && revoke.mutate(revoking.id)}
            >
              Révoquer la clé
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
