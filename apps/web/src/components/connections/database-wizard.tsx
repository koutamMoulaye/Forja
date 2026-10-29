"use client";

import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { CaretDown, CaretRight, Key, MagnifyingGlass, Table } from "@phosphor-icons/react";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Segmented } from "@/components/ui/tabs";
import { ApiError } from "@/lib/api/errors";
import { cn } from "@/lib/cn";
import {
  createConnection,
  importObjects,
  saveSchedule,
  testDraft,
  useExploration,
  type Connection,
  type ConnectionCreate,
  type DatabaseTable,
  type ImportResponse,
  type TableSelection,
} from "@/lib/connections/queries";
import {
  CONNECTION_TYPES,
  DATABASE_TYPES,
  estimateLabel,
  type DatabaseType,
} from "@/lib/connections/view";
import { matchesQuery, plural } from "@/lib/format";
import { ReadOnlyAdvice, ScheduleField, TestOutcome, WizardSteps } from "./wizard";

const STEPS = ["Connexion", "Test", "Tables", "Planification"];

type Form = {
  type: DatabaseType;
  name: string;
  host: string;
  port: string;
  database: string;
  username: string;
  password: string;
  ssl: "prefer" | "require" | "disable";
};

type Choice = { mode: "full" | "incremental"; cursor: string | null };

function draft(form: Form): ConnectionCreate {
  return {
    name: form.name.trim() || `${CONNECTION_TYPES[form.type].short} ${form.database}`,
    type: form.type,
    params: {
      host: form.host.trim(),
      port: form.port ? Number(form.port) : null,
      database: form.database.trim(),
      username: form.username.trim(),
      ssl: form.ssl,
    },
    secrets: form.password ? { password: form.password } : {},
  };
}

const key = (table: DatabaseTable) => `${table.schema_name}.${table.name}`;

/** Wizard of a database source: connection, test, tables and their mode, schedule. */
export function DatabaseWizard({
  projectId,
  onDone,
}: {
  projectId: string;
  onDone: (result: { connection: Connection; imported: ImportResponse }) => void;
}) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<Form>({
    type: "postgres",
    name: "",
    host: "",
    port: "",
    database: "",
    username: "",
    password: "",
    ssl: "prefer",
  });
  const [connection, setConnection] = useState<Connection | null>(null);
  const [chosen, setChosen] = useState<Map<string, Choice>>(new Map());
  const [schedule, setSchedule] = useState("Tous les jours à 6 h");
  const set = <K extends keyof Form>(name: K, value: Form[K]) =>
    setForm((current) => ({ ...current, [name]: value }));

  const test = useMutation({ mutationFn: () => testDraft(projectId, draft(form)) });
  const create = useMutation({
    mutationFn: async () => connection ?? createConnection(projectId, draft(form)),
    onSuccess: (created) => {
      setConnection(created);
      setStep(2);
    },
  });
  const submit = useMutation({
    mutationFn: async () => {
      const tables: TableSelection[] = [...chosen.entries()].map(([name, choice]) => {
        const [schema, ...rest] = name.split(".");
        return {
          schema_name: schema!,
          table: rest.join("."),
          mode: choice.mode,
          cursor_column: choice.mode === "incremental" ? choice.cursor : null,
        };
      });
      const imported = await importObjects(connection!.id, {
        tables,
        endpoints: [],
        load_now: true,
      });
      if (schedule.trim() && schedule.trim().toLowerCase() !== "manuel") {
        await saveSchedule({ type: "connection", id: connection!.id }, schedule.trim());
      }
      return imported;
    },
    onSuccess: (imported) => onDone({ connection: connection!, imported }),
  });

  const formReady = form.host.trim() && form.database.trim() && form.username.trim();
  return (
    <>
      <div className="px-6 pb-2">
        <WizardSteps steps={STEPS} current={step} />
      </div>
      <DialogBody className="flex flex-col gap-4">
        {step === 0 ? (
          <ConnectionForm form={form} set={set} locked={connection !== null} />
        ) : step === 1 ? (
          <div className="flex flex-col gap-3">
            <p className="m-0 text-ui text-tx2">
              Forja se connecte à <strong className="text-tx">{form.host}</strong> avec le compte{" "}
              <strong className="text-tx">{form.username}</strong>, sans rien lire encore.
            </p>
            <TestOutcome result={test.data ?? null} pending={test.isPending} error={test.error} />
            {create.error ? (
              <p role="alert" className="m-0 text-ui text-err-fg">
                {create.error instanceof ApiError
                  ? create.error.message
                  : "Enregistrement impossible."}
              </p>
            ) : null}
          </div>
        ) : step === 2 ? (
          <TablePicker connectionId={connection!.id} chosen={chosen} onChange={setChosen} />
        ) : (
          <div className="flex flex-col gap-3">
            <ScheduleField projectId={projectId} value={schedule} onChange={setSchedule} />
            <p className="m-0 text-meta text-tx3">
              Chaque chargement planifié reprend les tables, puis reconstruit Silver, Gold, les data
              marts publiés et le serving selon les plans approuvés. Un premier chargement part dès
              la validation.
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
        {step === 1 || step === 3 ? (
          <Button variant="quiet" onClick={() => setStep(step - 1)} className="mr-auto">
            Retour
          </Button>
        ) : (
          <span className="mr-auto" />
        )}
        {step === 0 ? (
          <Button
            variant="primary"
            disabled={!formReady}
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
            <Button
              variant="primary"
              disabled={!test.data?.ok}
              loading={create.isPending}
              onClick={() => create.mutate()}
            >
              Choisir les tables
            </Button>
          </>
        ) : step === 2 ? (
          <Button variant="primary" disabled={chosen.size === 0} onClick={() => setStep(3)}>
            {chosen.size ? `Continuer avec ${plural(chosen.size, "table", "tables")}` : "Continuer"}
          </Button>
        ) : (
          <Button variant="primary" loading={submit.isPending} onClick={() => submit.mutate()}>
            Importer et charger
          </Button>
        )}
      </DialogFooter>
    </>
  );
}

function ConnectionForm({
  form,
  set,
  locked,
}: {
  form: Form;
  set: <K extends keyof Form>(name: K, value: Form[K]) => void;
  locked: boolean;
}) {
  return (
    <div className="flex flex-col gap-3.5">
      <Segmented
        label="Type de base"
        value={form.type}
        onValueChange={(type) => set("type", type)}
        options={DATABASE_TYPES.map((type) => ({
          value: type,
          label: CONNECTION_TYPES[type].label,
        }))}
      />
      <div className="grid grid-cols-[1fr_120px] gap-3">
        <Field label="Hôte">
          {({ id }) => (
            <Input
              id={id}
              value={form.host}
              disabled={locked}
              onChange={(e) => set("host", e.target.value)}
              placeholder="db.entreprise.local"
              autoComplete="off"
            />
          )}
        </Field>
        <Field label="Port">
          {({ id }) => (
            <Input
              id={id}
              value={form.port}
              disabled={locked}
              inputMode="numeric"
              onChange={(e) => set("port", e.target.value.replace(/\D/g, ""))}
              placeholder={String(CONNECTION_TYPES[form.type].port)}
            />
          )}
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Base de données">
          {({ id }) => (
            <Input
              id={id}
              value={form.database}
              disabled={locked}
              onChange={(e) => set("database", e.target.value)}
              placeholder="ventes"
              autoComplete="off"
            />
          )}
        </Field>
        <Field label="Nom de la connexion" hint="Facultatif">
          {({ id, describedBy }) => (
            <Input
              id={id}
              aria-describedby={describedBy}
              value={form.name}
              disabled={locked}
              onChange={(e) => set("name", e.target.value)}
              placeholder="Base des ventes"
            />
          )}
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Utilisateur">
          {({ id }) => (
            <Input
              id={id}
              value={form.username}
              disabled={locked}
              onChange={(e) => set("username", e.target.value)}
              autoComplete="off"
            />
          )}
        </Field>
        <Field label="Mot de passe">
          {({ id }) => (
            <PasswordInput
              id={id}
              value={form.password}
              disabled={locked}
              onChange={(e) => set("password", e.target.value)}
              autoComplete="new-password"
            />
          )}
        </Field>
      </div>
      <Field label="Chiffrement (SSL)">
        {({ id }) => (
          <Select
            value={form.ssl}
            onValueChange={(v) => set("ssl", v as Form["ssl"])}
            disabled={locked}
          >
            <SelectTrigger id={id} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="prefer">Si le serveur le propose</SelectItem>
              <SelectItem value="require">Obligatoire</SelectItem>
              <SelectItem value="disable">Désactivé</SelectItem>
            </SelectContent>
          </Select>
        )}
      </Field>
      <ReadOnlyAdvice />
    </div>
  );
}

/** Tables of the database: pick, choose full or incremental, see the columns. */
function TablePicker({
  connectionId,
  chosen,
  onChange,
}: {
  connectionId: string;
  chosen: Map<string, Choice>;
  onChange: (next: Map<string, Choice>) => void;
}) {
  const exploration = useExploration(connectionId);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const tables = useMemo(
    () =>
      (exploration.data?.tables ?? []).filter((t) =>
        matchesQuery(query, t.name, t.schema_name, ...t.columns.map((c) => c.name)),
      ),
    [exploration.data, query],
  );

  if (exploration.isPending) {
    return (
      <div className="flex flex-col gap-2" aria-busy="true" aria-label="Exploration de la base">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-12 w-full rounded-lg" />
        ))}
      </div>
    );
  }
  if (exploration.isError) {
    return (
      <p role="alert" className="m-0 rounded-xl bg-err-bg px-4 py-3 text-ui text-err-fg">
        {exploration.error instanceof ApiError
          ? exploration.error.message
          : "La base ne répond pas."}
      </p>
    );
  }

  const toggle = (table: DatabaseTable, on: boolean) => {
    const next = new Map(chosen);
    if (on) {
      next.set(key(table), {
        mode: table.suggested_cursor ? "incremental" : "full",
        cursor: table.suggested_cursor ?? null,
      });
    } else {
      next.delete(key(table));
    }
    onChange(next);
  };
  const update = (table: DatabaseTable, choice: Choice) =>
    onChange(new Map(chosen).set(key(table), choice));

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <MagnifyingGlass
          size={16}
          className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-tx3"
        />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher une table ou une colonne"
          aria-label="Rechercher une table ou une colonne"
          className="pl-9"
        />
      </div>
      <p className="m-0 text-meta text-tx3">
        {plural(exploration.data!.tables.length, "table ou vue", "tables et vues")} dans{" "}
        {exploration.data!.schemas.join(", ")}. L’incrémental ne relit que les lignes dont la
        colonne curseur dépasse le dernier chargement.
      </p>
      <ul className="m-0 flex list-none flex-col gap-1.5 p-0" aria-label="Tables de la base">
        {tables.map((table) => {
          const choice = chosen.get(key(table));
          const expanded = open === key(table);
          const cursors = table.columns.filter((c) => /^(timestamp|date|int)/.test(c.forja_type));
          return (
            <li
              key={key(table)}
              data-testid={`table-${table.name}`}
              className={cn(
                "flex flex-col gap-2 rounded-xl px-3.5 py-2.5",
                choice ? "bg-acc-soft/40 shadow-[inset_0_0_0_1px_var(--acc)]" : "bg-sunk",
              )}
            >
              <div className="flex items-center gap-3">
                <Checkbox
                  checked={Boolean(choice)}
                  onCheckedChange={(on) => toggle(table, on === true)}
                  aria-label={`Importer ${table.schema_name}.${table.name}`}
                />
                <button
                  type="button"
                  onClick={() => setOpen(expanded ? null : key(table))}
                  aria-expanded={expanded}
                  className="flex min-w-0 flex-1 items-center gap-2 border-0 bg-transparent p-0 text-left"
                >
                  {expanded ? <CaretDown size={13} /> : <CaretRight size={13} />}
                  <Table size={16} className="flex-none text-tx3" />
                  <span className="truncate font-mono text-mono text-tx">
                    {table.schema_name}.{table.name}
                  </span>
                  {table.kind === "view" ? (
                    <span className="rounded-xs bg-node px-1.5 text-[11.5px] text-tx3">vue</span>
                  ) : null}
                </button>
                <span className="text-meta text-tx3 tabular-nums">
                  {estimateLabel(table.estimated_rows)} · {table.columns.length} col.
                </span>
              </div>
              {choice ? (
                <div className="flex flex-wrap items-center gap-2 pl-8">
                  <Segmented
                    size="sm"
                    label={`Mode de chargement de ${table.name}`}
                    value={choice.mode}
                    onValueChange={(mode) =>
                      update(table, {
                        mode,
                        cursor: choice.cursor ?? table.suggested_cursor ?? cursors[0]?.name ?? null,
                      })
                    }
                    options={[
                      { value: "full", label: "Complet" },
                      { value: "incremental", label: "Incrémental" },
                    ]}
                  />
                  {choice.mode === "incremental" ? (
                    <Select
                      value={choice.cursor ?? undefined}
                      onValueChange={(cursor) => update(table, { ...choice, cursor })}
                    >
                      <SelectTrigger
                        aria-label={`Colonne curseur de ${table.name}`}
                        className="h-8 w-auto min-w-[180px]"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {cursors.map((column) => (
                          <SelectItem key={column.name} value={column.name}>
                            {column.name}
                            {column.name === table.suggested_cursor ? " (proposée)" : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : null}
                  {choice.mode === "incremental" && choice.cursor ? (
                    <span className="text-meta text-tx3">
                      {(table.cursor_candidates ?? []).find((c) => c.column === choice.cursor)
                        ?.reason ??
                        "Les lignes dont cette colonne dépasse la valeur du dernier chargement."}
                    </span>
                  ) : null}
                </div>
              ) : null}
              {expanded ? (
                <table className="ml-8 border-collapse text-meta">
                  <thead>
                    <tr className="text-left text-tx3">
                      <th className="py-1 pr-4 font-semibold">Colonne</th>
                      <th className="py-1 pr-4 font-semibold">Type de la base</th>
                      <th className="py-1 font-semibold">Type Bronze</th>
                    </tr>
                  </thead>
                  <tbody>
                    {table.columns.map((column) => (
                      <tr key={column.name}>
                        <td className="py-0.5 pr-4 font-mono text-mono text-tx">
                          {column.name}
                          {(table.primary_key ?? []).includes(column.name) ? (
                            <Key
                              size={12}
                              className="ml-1 inline text-tx3"
                              aria-label="clé primaire"
                            />
                          ) : null}
                        </td>
                        <td className="py-0.5 pr-4 text-tx2">{column.type}</td>
                        <td className="py-0.5 font-mono text-mono text-tx2">{column.forja_type}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : null}
            </li>
          );
        })}
      </ul>
      {tables.length === 0 ? (
        <p className="m-0 text-center text-ui text-tx3">Aucune table ne correspond.</p>
      ) : null}
    </div>
  );
}
