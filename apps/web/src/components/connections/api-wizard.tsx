"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ArrowRight, Info, TreeStructure } from "@phosphor-icons/react";
import { Code } from "@/components/screens/screen";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DialogBody, DialogFooter } from "@/components/ui/dialog";
import { Field, Input, PasswordInput } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { ApiError } from "@/lib/api/errors";
import {
  createConnection,
  importObjects,
  previewApi,
  saveSchedule,
  testDraft,
  type ApiPreview,
  type Connection,
  type ConnectionCreate,
  type ImportResponse,
} from "@/lib/connections/queries";
import {
  AUTH_LABELS,
  PAGINATION_LABELS,
  authSecret,
  type AuthKind,
  type PaginationKind,
} from "@/lib/connections/view";
import { plural, shortValue } from "@/lib/format";
import { ScheduleField, TestOutcome, WizardSteps } from "./wizard";

const STEPS = ["Connexion", "Test", "Endpoint", "Aperçu", "Planification"];

type Form = {
  name: string;
  baseUrl: string;
  auth: AuthKind;
  keyName: string;
  keyIn: "header" | "query";
  username: string;
  tokenUrl: string;
  clientId: string;
  scope: string;
  secret: string;
  endpoint: string;
  path: string;
  recordsPath: string;
  pagination: PaginationKind;
  pageParam: string;
  sizeParam: string;
  pageSize: string;
  offsetParam: string;
  limitParam: string;
  cursorParam: string;
  cursorPath: string;
  nextUrlPath: string;
  incremental: boolean;
  sinceParam: string;
  cursorField: string;
  initialValue: string;
  rateLimit: string;
  retries: string;
};

const INITIAL: Form = {
  name: "",
  baseUrl: "",
  auth: "none",
  keyName: "X-API-Key",
  keyIn: "header",
  username: "",
  tokenUrl: "",
  clientId: "",
  scope: "",
  secret: "",
  endpoint: "",
  path: "",
  recordsPath: "",
  pagination: "none",
  pageParam: "page",
  sizeParam: "per_page",
  pageSize: "100",
  offsetParam: "offset",
  limitParam: "limit",
  cursorParam: "cursor",
  cursorPath: "",
  nextUrlPath: "next",
  incremental: false,
  sinceParam: "since",
  cursorField: "updated_at",
  initialValue: "",
  rateLimit: "",
  retries: "5",
};

const blank = (value: string) => (value.trim() ? value.trim() : null);

function endpointName(form: Form): string {
  const fromPath = form.path.split("/").filter(Boolean).pop() ?? "";
  return (form.endpoint.trim() || fromPath || "enregistrements").toLowerCase();
}

function params(form: Form, withEndpoint: boolean): Record<string, unknown> {
  const pageSize = Number(form.pageSize) || null;
  return {
    base_url: form.baseUrl.trim(),
    auth: {
      kind: form.auth,
      key_name: form.auth === "api_key" ? blank(form.keyName) : null,
      key_in: form.keyIn,
      username: form.auth === "basic" ? blank(form.username) : null,
      token_url: form.auth === "oauth2_client_credentials" ? blank(form.tokenUrl) : null,
      client_id: form.auth === "oauth2_client_credentials" ? blank(form.clientId) : null,
      scope: form.auth === "oauth2_client_credentials" ? blank(form.scope) : null,
    },
    pagination: {
      kind: form.pagination,
      page_param: form.pageParam || "page",
      size_param: blank(form.sizeParam),
      page_size: pageSize,
      offset_param: form.offsetParam || "offset",
      limit_param: form.limitParam || "limit",
      cursor_param: form.cursorParam || "cursor",
      cursor_path: blank(form.cursorPath),
      next_url_path: blank(form.nextUrlPath),
    },
    endpoints: withEndpoint
      ? [
          {
            name: endpointName(form),
            path: form.path.trim() || "/",
            records_path: blank(form.recordsPath),
            incremental: form.incremental
              ? {
                  param: form.sinceParam.trim(),
                  cursor_field: form.cursorField.trim(),
                  initial_value: blank(form.initialValue),
                }
              : null,
          },
        ]
      : [],
    rate_limit_per_second: Number(form.rateLimit) || null,
    max_retries: Number(form.retries) || 0,
  };
}

function draft(form: Form, withEndpoint: boolean): ConnectionCreate {
  const secret = authSecret(form.auth);
  return {
    name: form.name.trim() || new URL(form.baseUrl.trim()).host,
    type: "rest_api",
    params: params(form, withEndpoint),
    secrets: secret && form.secret ? { [secret.field]: form.secret } : {},
  };
}

function validUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/** Wizard of an API source: connection, test, endpoint, preview of the first page, schedule. */
export function ApiWizard({
  projectId,
  onDone,
}: {
  projectId: string;
  onDone: (result: { connection: Connection; imported: ImportResponse }) => void;
}) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<Form>(INITIAL);
  const [children, setChildren] = useState(true);
  const [schedule, setSchedule] = useState("Tous les jours à 6 h");
  const set = <K extends keyof Form>(name: K, value: Form[K]) =>
    setForm((current) => ({ ...current, [name]: value }));

  const test = useMutation({ mutationFn: () => testDraft(projectId, draft(form, false)) });
  const preview = useMutation({
    mutationFn: () =>
      previewApi(projectId, {
        params: params(form, true),
        secrets: draft(form, true).secrets,
        endpoint: null,
        connection_id: null,
      }),
  });
  const submit = useMutation({
    mutationFn: async () => {
      const connection = await createConnection(projectId, draft(form, true));
      const imported = await importObjects(connection.id, {
        tables: [],
        endpoints: [{ endpoint: endpointName(form), include_children: children }],
        load_now: true,
      });
      if (schedule.trim() && schedule.trim().toLowerCase() !== "manuel") {
        await saveSchedule({ type: "connection", id: connection.id }, schedule.trim());
      }
      return { connection, imported };
    },
    onSuccess: onDone,
  });

  const secret = authSecret(form.auth);
  const connectionReady =
    validUrl(form.baseUrl) &&
    (form.auth !== "oauth2_client_credentials" || (validUrl(form.tokenUrl) && form.clientId));
  const endpointReady =
    form.path.trim().length > 0 &&
    (!form.incremental || (form.sinceParam.trim() && form.cursorField.trim())) &&
    (form.pagination !== "cursor" || form.cursorPath.trim()) &&
    (form.pagination !== "next_url" || form.nextUrlPath.trim());

  return (
    <>
      <div className="px-6 pb-2">
        <WizardSteps steps={STEPS} current={step} />
      </div>
      <DialogBody className="flex flex-col gap-4">
        {step === 0 ? (
          <div className="flex flex-col gap-3.5">
            <div className="grid grid-cols-[1fr_200px] gap-3">
              <Field label="URL de base" hint="Les endpoints s’ajoutent à cette adresse.">
                {({ id, describedBy }) => (
                  <Input
                    id={id}
                    aria-describedby={describedBy}
                    value={form.baseUrl}
                    onChange={(e) => set("baseUrl", e.target.value)}
                    placeholder="https://api.exemple.fr/v1"
                    autoComplete="off"
                  />
                )}
              </Field>
              <Field label="Nom" hint="Facultatif">
                {({ id, describedBy }) => (
                  <Input
                    id={id}
                    aria-describedby={describedBy}
                    value={form.name}
                    onChange={(e) => set("name", e.target.value)}
                    placeholder="Boutique en ligne"
                  />
                )}
              </Field>
            </div>
            <Field label="Authentification">
              {({ id }) => (
                <Select value={form.auth} onValueChange={(v) => set("auth", v as AuthKind)}>
                  <SelectTrigger id={id} className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(AUTH_LABELS) as AuthKind[]).map((kind) => (
                      <SelectItem key={kind} value={kind}>
                        {AUTH_LABELS[kind]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </Field>
            {form.auth === "api_key" ? (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Nom de la clé">
                  {({ id }) => (
                    <Input
                      id={id}
                      value={form.keyName}
                      onChange={(e) => set("keyName", e.target.value)}
                    />
                  )}
                </Field>
                <Field label="Envoyée dans">
                  {({ id }) => (
                    <Select
                      value={form.keyIn}
                      onValueChange={(v) => set("keyIn", v as Form["keyIn"])}
                    >
                      <SelectTrigger id={id} className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="header">Un en-tête</SelectItem>
                        <SelectItem value="query">Un paramètre d’URL</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                </Field>
              </div>
            ) : null}
            {form.auth === "basic" ? (
              <Field label="Utilisateur">
                {({ id }) => (
                  <Input
                    id={id}
                    value={form.username}
                    onChange={(e) => set("username", e.target.value)}
                  />
                )}
              </Field>
            ) : null}
            {form.auth === "oauth2_client_credentials" ? (
              <div className="grid grid-cols-2 gap-3">
                <Field label="URL du jeton">
                  {({ id }) => (
                    <Input
                      id={id}
                      value={form.tokenUrl}
                      onChange={(e) => set("tokenUrl", e.target.value)}
                      placeholder="https://auth.exemple.fr/oauth/token"
                    />
                  )}
                </Field>
                <Field label="Identifiant client">
                  {({ id }) => (
                    <Input
                      id={id}
                      value={form.clientId}
                      onChange={(e) => set("clientId", e.target.value)}
                    />
                  )}
                </Field>
                <Field label="Portée (scope)" hint="Facultatif">
                  {({ id, describedBy }) => (
                    <Input
                      id={id}
                      aria-describedby={describedBy}
                      value={form.scope}
                      onChange={(e) => set("scope", e.target.value)}
                    />
                  )}
                </Field>
              </div>
            ) : null}
            {secret ? (
              <Field label={secret.label} hint="Chiffré sur ce poste, jamais réaffiché.">
                {({ id, describedBy }) => (
                  <PasswordInput
                    id={id}
                    aria-describedby={describedBy}
                    value={form.secret}
                    onChange={(e) => set("secret", e.target.value)}
                    autoComplete="new-password"
                  />
                )}
              </Field>
            ) : null}
            <p className="m-0 flex items-start gap-2 rounded-xl bg-sunk px-3.5 py-2.5 text-meta text-tx2">
              <Info size={16} className="mt-px flex-none text-tx3" />
              Les adresses privées ou locales sont refusées, sauf si un administrateur les a
              autorisées dans les réglages.
            </p>
          </div>
        ) : step === 1 ? (
          <div className="flex flex-col gap-3">
            <p className="m-0 text-ui text-tx2">
              Forja appelle <Code>{form.baseUrl}</Code> avec l’authentification choisie.
            </p>
            <TestOutcome result={test.data ?? null} pending={test.isPending} error={test.error} />
          </div>
        ) : step === 2 ? (
          <EndpointForm form={form} set={set} />
        ) : step === 3 ? (
          <PreviewPanel
            preview={preview.data ?? null}
            pending={preview.isPending}
            error={preview.error}
            childrenIncluded={children}
            onChildren={setChildren}
          />
        ) : (
          <div className="flex flex-col gap-3">
            <ScheduleField projectId={projectId} value={schedule} onChange={setSchedule} />
            <p className="m-0 text-meta text-tx3">
              {form.incremental
                ? `Chaque chargement envoie ${form.sinceParam}=<dernière valeur de ${form.cursorField}>.`
                : "Chaque chargement relit tous les enregistrements."}{" "}
              Un premier chargement part dès la validation.
            </p>
            {submit.error ? (
              <p role="alert" className="m-0 text-ui text-err-fg">
                {submit.error instanceof ApiError ? submit.error.message : "Import impossible."}
              </p>
            ) : null}
          </div>
        )}
      </DialogBody>
      <DialogFooter className="items-center">
        {step > 0 ? (
          <Button variant="quiet" onClick={() => setStep(step - 1)} className="mr-auto">
            Retour
          </Button>
        ) : (
          <span className="mr-auto" />
        )}
        {step === 0 ? (
          <Button
            variant="primary"
            disabled={!connectionReady}
            onClick={() => {
              setStep(1);
              test.mutate();
            }}
          >
            Tester la connexion
          </Button>
        ) : step === 1 ? (
          <>
            <Button variant="secondary" loading={test.isPending} onClick={() => test.mutate()}>
              Retester
            </Button>
            <Button variant="primary" disabled={!test.data?.ok} onClick={() => setStep(2)}>
              Configurer l’endpoint
            </Button>
          </>
        ) : step === 2 ? (
          <Button
            variant="primary"
            disabled={!endpointReady}
            onClick={() => {
              setStep(3);
              preview.mutate();
            }}
          >
            Voir l’aperçu
          </Button>
        ) : step === 3 ? (
          <>
            <Button
              variant="secondary"
              loading={preview.isPending}
              onClick={() => preview.mutate()}
            >
              Rafraîchir
            </Button>
            <Button variant="primary" disabled={!preview.data} onClick={() => setStep(4)}>
              Planifier
            </Button>
          </>
        ) : (
          <Button variant="primary" loading={submit.isPending} onClick={() => submit.mutate()}>
            Enregistrer et charger
          </Button>
        )}
      </DialogFooter>
    </>
  );
}

function EndpointForm({
  form,
  set,
}: {
  form: Form;
  set: <K extends keyof Form>(name: K, value: Form[K]) => void;
}) {
  const text = (name: keyof Form, label: string, placeholder?: string, hint?: string) => (
    <Field label={label} hint={hint}>
      {({ id, describedBy }) => (
        <Input
          id={id}
          aria-describedby={describedBy}
          value={String(form[name])}
          onChange={(e) => set(name, e.target.value as never)}
          placeholder={placeholder}
          autoComplete="off"
        />
      )}
    </Field>
  );
  return (
    <div className="flex flex-col gap-3.5">
      <div className="grid grid-cols-[1fr_180px] gap-3">
        {text("path", "Chemin de l’endpoint", "/commandes")}
        {text("endpoint", "Nom de la source", endpointName(form), "Facultatif")}
      </div>
      {text(
        "recordsPath",
        "Chemin des enregistrements",
        "data.items",
        "Où sont les enregistrements dans la réponse ; détecté s’il est vide.",
      )}
      <Field label="Pagination">
        {({ id }) => (
          <Select
            value={form.pagination}
            onValueChange={(v) => set("pagination", v as PaginationKind)}
          >
            <SelectTrigger id={id} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(PAGINATION_LABELS) as PaginationKind[]).map((kind) => (
                <SelectItem key={kind} value={kind}>
                  {PAGINATION_LABELS[kind]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>
      {form.pagination === "page_number" ? (
        <div className="grid grid-cols-3 gap-3">
          {text("pageParam", "Paramètre de page")}
          {text("sizeParam", "Paramètre de taille")}
          {text("pageSize", "Taille de page")}
        </div>
      ) : null}
      {form.pagination === "offset" ? (
        <div className="grid grid-cols-3 gap-3">
          {text("offsetParam", "Paramètre de décalage")}
          {text("limitParam", "Paramètre de limite")}
          {text("pageSize", "Taille de page")}
        </div>
      ) : null}
      {form.pagination === "cursor" ? (
        <div className="grid grid-cols-3 gap-3">
          {text("cursorParam", "Paramètre du curseur")}
          {text("cursorPath", "Chemin du curseur suivant", "meta.next_cursor")}
          {text("pageSize", "Taille de page")}
        </div>
      ) : null}
      {form.pagination === "next_url"
        ? text("nextUrlPath", "Chemin de l’URL suivante", "links.next")
        : null}
      <label className="flex items-center gap-2.5 text-ui">
        <Checkbox
          checked={form.incremental}
          onCheckedChange={(on) => set("incremental", on === true)}
        />
        Chargement incrémental : ne demander que les enregistrements modifiés
      </label>
      {form.incremental ? (
        <div className="grid grid-cols-3 gap-3">
          {text("sinceParam", "Paramètre envoyé", "since")}
          {text("cursorField", "Champ de date ou d’id", "updated_at")}
          {text("initialValue", "Valeur de départ", "2025-01-01", "Facultatif")}
        </div>
      ) : null}
      <div className="grid grid-cols-2 gap-3">
        {text("rateLimit", "Limite de débit (appels par seconde)", "illimitée")}
        {text("retries", "Nouvelles tentatives (429, 5xx)")}
      </div>
    </div>
  );
}

function PreviewPanel({
  preview,
  pending,
  error,
  childrenIncluded,
  onChildren,
}: {
  preview: ApiPreview | null;
  pending: boolean;
  error: unknown;
  childrenIncluded: boolean;
  onChildren: (value: boolean) => void;
}) {
  if (pending) {
    return (
      <p role="status" className="m-0 flex items-center gap-2 text-ui text-tx2">
        <Spinner size={13} /> Lecture de la première page…
      </p>
    );
  }
  if (error) {
    return (
      <p role="alert" className="m-0 rounded-xl bg-err-bg px-4 py-3 text-ui text-err-fg">
        {error instanceof ApiError ? error.message : "Aperçu impossible."}
      </p>
    );
  }
  if (!preview) return null;
  const [main, ...children] = preview.tables;
  return (
    <div className="flex flex-col gap-3" data-testid="api-preview">
      <p className="m-0 text-ui text-tx2">
        {plural(preview.record_count, "enregistrement", "enregistrements")} sur la première page
        {preview.records_path ? (
          <>
            {" "}
            dans <Code>{preview.records_path}</Code>
            {preview.records_path_detected ? " (détecté)" : ""}
          </>
        ) : null}
        {preview.has_next_page ? ", d’autres pages suivent" : ""} · {preview.duration_ms} ms
      </p>
      {main ? <PreviewTableView table={main} /> : null}
      {children.length ? (
        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2.5 text-ui font-semibold">
            <Checkbox
              checked={childrenIncluded}
              onCheckedChange={(on) => onChildren(on === true)}
            />
            <TreeStructure size={16} className="text-tx3" />
            Listes imbriquées en tables enfants ({children.length})
          </label>
          {childrenIncluded
            ? children.map((table) => <PreviewTableView key={table.name} table={table} compact />)
            : null}
          {childrenIncluded && preview.relations.length ? (
            <ul
              className="m-0 flex list-none flex-col gap-1 p-0 text-meta text-tx2"
              aria-label="Relations proposées"
            >
              {preview.relations.map((r) => (
                <li key={`${r.from_table}.${r.from_column}`} className="flex items-center gap-1.5">
                  Relation proposée : <Code>{`${r.from_table}.${r.from_column}`}</Code>
                  <ArrowRight size={12} />
                  <Code>{`${r.to_table}.${r.to_column}`}</Code>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function PreviewTableView({
  table,
  compact = false,
}: {
  table: ApiPreview["tables"][number];
  compact?: boolean;
}) {
  const columns = table.columns.slice(0, compact ? 5 : 7);
  return (
    <div className="flex flex-col gap-1.5 rounded-xl bg-sunk p-3">
      <span className="flex items-center gap-2 text-meta">
        <Code className="bg-node">{table.name}</Code>
        <span className="text-tx3">
          {plural(table.record_count, "ligne", "lignes")} ·{" "}
          {plural(table.columns.length, "colonne", "colonnes")}
          {table.parent_key ? ` · liée par ${table.parent_key}` : ""}
        </span>
      </span>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-meta">
          <thead>
            <tr>
              {columns.map((column) => (
                <th
                  key={column.name}
                  scope="col"
                  className="py-1 pr-3 text-left font-mono text-mono font-normal whitespace-nowrap text-tx3"
                >
                  {column.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.slice(0, compact ? 2 : 3).map((row, index) => (
              <tr key={index}>
                {columns.map((column) => (
                  <td key={column.name} className="max-w-[160px] truncate py-0.5 pr-3 text-tx2">
                    {shortValue(row[column.name] == null ? null : String(row[column.name]))}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
