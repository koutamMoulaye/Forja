"use client";

import { useState } from "react";
import { LinkSimple, Plus } from "@phosphor-icons/react";
import {
  Card,
  EmptyState,
  ListHead,
  ListSkeleton,
  SectionTitle,
} from "@/components/screens/screen";
import { useShell } from "@/components/shell/shell-context";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { Segmented } from "@/components/ui/tabs";
import { RELATION_STATUS, relationConfidence } from "@/lib/model/view";
import { useSources, useTables, type Relation } from "@/lib/project/queries";

const GRID = "minmax(0,1.5fr) 110px 76px minmax(0,1.6fr) 200px";

type Filter = "all" | Relation["status"];

/** Suggested, confirmed and rejected relations, and a form to declare one by hand. */
export function ModelRelations({
  relations,
  loading,
  busy,
  onConfirm,
  onReject,
  onDeclare,
}: {
  relations: Relation[];
  loading: boolean;
  busy: boolean;
  onConfirm: (id: string) => void;
  onReject: (id: string) => void;
  onDeclare: (body: {
    from_source_id: string;
    from_column: string;
    to_source_id: string;
    to_column: string;
  }) => Promise<unknown>;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [adding, setAdding] = useState(false);
  if (loading) return <ListSkeleton rows={4} />;
  const visible = relations.filter((r) => filter === "all" || r.status === filter);
  const count = (status: Relation["status"]) => relations.filter((r) => r.status === status).length;
  return (
    <div className="flex flex-col gap-4" data-testid="relations">
      <div className="flex flex-wrap items-center gap-3">
        <Segmented<Filter>
          label="Filtrer les relations"
          value={filter}
          onValueChange={setFilter}
          options={[
            { value: "all", label: `Toutes ${relations.length}` },
            { value: "suggested", label: `Suggérées ${count("suggested")}` },
            { value: "confirmed", label: `Confirmées ${count("confirmed")}` },
            { value: "rejected", label: `Rejetées ${count("rejected")}` },
          ]}
        />
        <Button variant="secondary" size="md" className="ml-auto" onClick={() => setAdding(true)}>
          <Plus size={14} />
          Ajouter une relation
        </Button>
      </div>
      {adding ? (
        <DeclareForm
          onCancel={() => setAdding(false)}
          onDeclare={async (body) => {
            await onDeclare(body);
            setAdding(false);
          }}
        />
      ) : null}
      {relations.length === 0 ? (
        <EmptyState
          icon={LinkSimple}
          title="Aucune relation détectée"
          description="Forja cherche les clés étrangères après chaque nettoyage. Vous pouvez en déclarer une à la main."
        />
      ) : (
        <Card role="table" aria-label="Relations" className="overflow-x-auto">
          <div className="min-w-[860px]">
            <ListHead
              style={{ gridTemplateColumns: GRID }}
              columns={["Relation", "Statut", "Confiance", "Explication", ""]}
            />
            {visible.map((relation) => {
              const status = RELATION_STATUS[relation.status];
              return (
                <div
                  role="row"
                  key={relation.id}
                  data-testid={`relation-${relation.from_source}-${relation.from_column}`}
                  className="grid min-h-[64px] items-center gap-3 border-t border-sunk px-5 py-2.5"
                  style={{ gridTemplateColumns: GRID }}
                >
                  <span role="cell" className="flex min-w-0 flex-col gap-0.5 font-mono text-[13px]">
                    <span className="truncate">
                      {relation.from_source}.{relation.from_column}
                    </span>
                    <span className="truncate text-tx3">
                      → {relation.to_source}.{relation.to_column} · {relation.cardinality}
                    </span>
                  </span>
                  <span role="cell" className="flex">
                    <StatusBadge kind={status.kind} label={status.label} size={12.5} />
                  </span>
                  <span role="cell" className="text-[14px] text-tx2 tabular-nums">
                    {relationConfidence(relation)}
                  </span>
                  <span role="cell" className="line-clamp-2 text-[13px] text-tx2">
                    {relation.origin === "manual" ? "Déclarée à la main. " : ""}
                    {relation.explanation}
                  </span>
                  <span role="cell" className="flex justify-end gap-1.5">
                    {relation.status !== "confirmed" ? (
                      <Button
                        variant="primary"
                        size="sm"
                        disabled={busy}
                        onClick={() => onConfirm(relation.id)}
                      >
                        Confirmer
                      </Button>
                    ) : null}
                    {relation.status !== "rejected" ? (
                      <Button
                        variant="quiet"
                        size="sm"
                        disabled={busy}
                        onClick={() => onReject(relation.id)}
                      >
                        Rejeter
                      </Button>
                    ) : null}
                  </span>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}

function DeclareForm({
  onCancel,
  onDeclare,
}: {
  onCancel: () => void;
  onDeclare: (body: {
    from_source_id: string;
    from_column: string;
    to_source_id: string;
    to_column: string;
  }) => Promise<void>;
}) {
  const { project } = useShell();
  const sources = useSources(project.id);
  const tables = useTables(project.id);
  const [value, setValue] = useState({ from: "", fromColumn: "", to: "", toColumn: "" });
  const [saving, setSaving] = useState(false);
  const columnsOf = (sourceId: string) =>
    (tables.data?.find((t) => t.layer === "silver" && t.source_id === sourceId)?.columns ?? [])
      .map((c) => c.name)
      .filter((name) => !name.startsWith("_"));
  const built = (sources.data ?? []).filter((s) => columnsOf(s.id).length > 0);
  const choose = (
    label: string,
    current: string,
    options: { value: string; label: string }[],
    set: (v: string) => void,
  ) => (
    <label className="flex min-w-[160px] flex-1 flex-col gap-1.5 text-meta font-semibold text-tx2">
      {label}
      <Select value={current || undefined} onValueChange={set}>
        <SelectTrigger aria-label={label} className="w-full">
          <SelectValue placeholder="Choisir" />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
  const sourceOptions = built.map((s) => ({ value: s.id, label: s.name }));
  const ready = value.from && value.fromColumn && value.to && value.toColumn;
  return (
    <Card className="flex flex-col gap-3 px-5 py-[18px]" data-testid="declare-relation">
      <SectionTitle>Nouvelle relation</SectionTitle>
      <p className="m-0 text-ui text-tx2">
        La colonne de départ référence la clé de la table d’arrivée. Forja mesure le taux
        d’inclusion puis confirme la relation.
      </p>
      <div className="flex flex-wrap gap-3">
        {choose("Table de départ", value.from, sourceOptions, (from) =>
          setValue((v) => ({ ...v, from, fromColumn: "" })),
        )}
        {choose(
          "Colonne",
          value.fromColumn,
          columnsOf(value.from).map((c) => ({ value: c, label: c })),
          (fromColumn) => setValue((v) => ({ ...v, fromColumn })),
        )}
        {choose("Table d’arrivée", value.to, sourceOptions, (to) =>
          setValue((v) => ({ ...v, to, toColumn: "" })),
        )}
        {choose(
          "Clé",
          value.toColumn,
          columnsOf(value.to).map((c) => ({ value: c, label: c })),
          (toColumn) => setValue((v) => ({ ...v, toColumn })),
        )}
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="quiet" size="md" onClick={onCancel}>
          Annuler
        </Button>
        <Button
          variant="primary"
          size="md"
          disabled={!ready}
          loading={saving}
          onClick={async () => {
            setSaving(true);
            try {
              await onDeclare({
                from_source_id: value.from,
                from_column: value.fromColumn,
                to_source_id: value.to,
                to_column: value.toColumn,
              });
            } finally {
              setSaving(false);
            }
          }}
        >
          Déclarer la relation
        </Button>
      </div>
    </Card>
  );
}
