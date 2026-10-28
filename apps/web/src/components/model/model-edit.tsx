"use client";

import { useState } from "react";
import { Plus, Trash } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
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
import { Segmented } from "@/components/ui/tabs";
import { cn } from "@/lib/cn";
import {
  AGGREGATIONS,
  scdView,
  type Dimension,
  type Fact,
  type GoldPlanPatch,
  type Measure,
} from "@/lib/model/view";
import { useTables, type GoldPlan } from "@/lib/project/queries";
import { useShell } from "@/components/shell/shell-context";

const EMPTY_MEASURE: Measure = {
  name: "",
  expression: "",
  aggregation: "sum",
  description: "",
  explanation: "",
};

export type EditFocus = {
  tab: "measures" | "scd" | "attributes";
  measure?: string;
  dimension?: string;
};

/**
 * Side panel editing the Gold plan: measures (aggregation, expression, new ones), the
 * historization of each dimension and its attributes. Saving creates a new version.
 */
export function ModelEditSheet({
  plan,
  focus,
  saving,
  onClose,
  onSave,
}: {
  plan: GoldPlan;
  focus: EditFocus | null;
  saving: boolean;
  onClose: () => void;
  onSave: (patch: GoldPlanPatch) => Promise<void>;
}) {
  return (
    <Sheet open={focus !== null} onOpenChange={(open) => !open && onClose()} modal>
      <SheetContent className="w-[460px]" data-testid="model-edit" aria-describedby={undefined}>
        {focus ? (
          <EditBody
            key={`${plan.version}-${focus.tab}-${focus.measure ?? ""}-${focus.dimension ?? ""}`}
            plan={plan}
            focus={focus}
            saving={saving}
            onClose={onClose}
            onSave={onSave}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function EditBody({
  plan,
  focus,
  saving,
  onClose,
  onSave,
}: {
  plan: GoldPlan;
  focus: EditFocus;
  saving: boolean;
  onClose: () => void;
  onSave: (patch: GoldPlanPatch) => Promise<void>;
}) {
  const { project } = useShell();
  const tables = useTables(project.id);
  const [tab, setTab] = useState(focus.tab);
  const [facts, setFacts] = useState<Fact[]>(() => structuredClone(plan.facts ?? []));
  const [dimensions, setDimensions] = useState<Dimension[]>(() =>
    structuredClone(plan.dimensions ?? []),
  );
  const [draft, setDraft] = useState<Measure>(EMPTY_MEASURE);
  const fact = facts[0];

  const setMeasure = (name: string, change: Partial<Measure>) =>
    setFacts((list) =>
      list.map((f, index) =>
        index === 0
          ? {
              ...f,
              measures: (f.measures ?? []).map((m) => (m.name === name ? { ...m, ...change } : m)),
            }
          : f,
      ),
    );
  const removeMeasure = (name: string) =>
    setFacts((list) =>
      list.map((f, index) =>
        index === 0 ? { ...f, measures: (f.measures ?? []).filter((m) => m.name !== name) } : f,
      ),
    );
  const addMeasure = () => {
    if (!draft.name.trim() || !draft.expression.trim()) return;
    setFacts((list) =>
      list.map((f, index) =>
        index === 0
          ? {
              ...f,
              measures: [
                ...(f.measures ?? []),
                { ...draft, name: draft.name.trim(), expression: draft.expression.trim() },
              ],
            }
          : f,
      ),
    );
    setDraft(EMPTY_MEASURE);
  };
  const setDimension = (name: string, change: Partial<Dimension>) =>
    setDimensions((list) => list.map((d) => (d.name === name ? { ...d, ...change } : d)));

  const silverColumns = (dimension: Dimension) =>
    (
      tables.data?.find((t) => t.layer === "silver" && t.name === `stg_${dimension.source}`)
        ?.columns ?? []
    )
      .map((c) => c.name)
      .filter((name) => !name.startsWith("_") && !dimension.natural_key.includes(name));

  const save = () =>
    onSave({
      facts,
      dimensions,
    });

  return (
    <>
      <SheetHeader>
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <SheetTitle>Modifier le modèle</SheetTitle>
            <SheetDescription>
              Version {plan.version} · l’enregistrement crée la version {plan.version + 1}
            </SheetDescription>
          </div>
          <SheetCloseButton />
        </div>
        <Segmented<EditFocus["tab"]>
          label="Partie du modèle"
          value={tab}
          onValueChange={setTab}
          options={[
            { value: "measures", label: "Mesures" },
            { value: "scd", label: "Historisation" },
            { value: "attributes", label: "Attributs" },
          ]}
        />
      </SheetHeader>
      <SheetBody>
        {tab === "measures" && fact ? (
          <div className="flex flex-col gap-2.5">
            {(fact.measures ?? []).map((measure) => (
              <div
                key={measure.name}
                data-testid={`edit-measure-${measure.name}`}
                className={cn(
                  "flex flex-col gap-2 rounded-lg bg-node p-3 shadow-sm",
                  focus.measure === measure.name && "shadow-[0_0_0_1.5px_var(--acc),var(--sh-sm)]",
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-[14px] font-semibold">
                    {measure.name}
                  </span>
                  <Select
                    value={measure.aggregation ?? "sum"}
                    onValueChange={(value) =>
                      setMeasure(measure.name, { aggregation: value as Measure["aggregation"] })
                    }
                  >
                    <SelectTrigger aria-label={`Agrégation de ${measure.name}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {AGGREGATIONS.map((a) => (
                        <SelectItem key={a.value} value={a.value}>
                          {a.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="danger-quiet"
                    size="icon-sm"
                    aria-label={`Retirer ${measure.name}`}
                    onClick={() => removeMeasure(measure.name)}
                  >
                    <Trash size={16} />
                  </Button>
                </div>
                <Input
                  variant="outline"
                  className="font-mono text-[13px]"
                  aria-label={`Expression de ${measure.name}`}
                  value={measure.expression}
                  onChange={(event) => setMeasure(measure.name, { expression: event.target.value })}
                />
              </div>
            ))}
            <div className="flex flex-col gap-2 rounded-lg bg-sunk p-3">
              <span className="text-meta font-semibold text-tx2">Nouvelle mesure</span>
              <div className="flex gap-2">
                <Input
                  variant="outline"
                  placeholder="nom_snake_case"
                  aria-label="Nom de la nouvelle mesure"
                  value={draft.name}
                  onChange={(event) => setDraft((d) => ({ ...d, name: event.target.value }))}
                />
                <Select
                  value={draft.aggregation ?? "sum"}
                  onValueChange={(value) =>
                    setDraft((d) => ({ ...d, aggregation: value as Measure["aggregation"] }))
                  }
                >
                  <SelectTrigger aria-label="Agrégation de la nouvelle mesure">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {AGGREGATIONS.map((a) => (
                      <SelectItem key={a.value} value={a.value}>
                        {a.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Input
                variant="outline"
                className="font-mono text-[13px]"
                placeholder="quantite * prix_unitaire"
                aria-label="Expression de la nouvelle mesure"
                value={draft.expression}
                onChange={(event) => setDraft((d) => ({ ...d, expression: event.target.value }))}
              />
              <Button variant="secondary" size="md" className="self-start" onClick={addMeasure}>
                <Plus size={14} />
                Ajouter
              </Button>
            </div>
          </div>
        ) : null}
        {tab === "scd"
          ? dimensions.map((dimension) => (
              <div
                key={dimension.name}
                className="flex flex-col gap-2 rounded-lg bg-node p-3 shadow-sm"
              >
                <span className="font-mono text-[14px] font-medium">{dimension.name}</span>
                <Segmented<"scd1" | "scd2">
                  label={`Historisation de ${dimension.name}`}
                  value={(dimension.scd ?? "scd1") as "scd1" | "scd2"}
                  onValueChange={(scd) => setDimension(dimension.name, { scd })}
                  options={[
                    { value: "scd1", label: scdView("scd1").label },
                    { value: "scd2", label: scdView("scd2").label },
                  ]}
                />
              </div>
            ))
          : null}
        {tab === "attributes"
          ? dimensions.map((dimension) => {
              const present = new Set((dimension.attributes ?? []).map((a) => a.column));
              const columns = [...new Set([...present, ...silverColumns(dimension)])];
              return (
                <div
                  key={dimension.name}
                  className={cn(
                    "flex flex-col gap-2 rounded-lg bg-node p-3 shadow-sm",
                    focus.dimension === dimension.name &&
                      "shadow-[0_0_0_1.5px_var(--acc),var(--sh-sm)]",
                  )}
                >
                  <span className="font-mono text-[14px] font-medium">{dimension.name}</span>
                  {columns.map((column) => (
                    <label key={column} className="flex items-center gap-2.5 text-[13.5px]">
                      <Checkbox
                        checked={present.has(column)}
                        onCheckedChange={(checked) =>
                          setDimension(dimension.name, {
                            attributes: checked
                              ? [
                                  ...(dimension.attributes ?? []),
                                  { column, name: column, description: "" },
                                ]
                              : (dimension.attributes ?? []).filter((a) => a.column !== column),
                          })
                        }
                      />
                      <span className="font-mono">{column}</span>
                    </label>
                  ))}
                </div>
              );
            })
          : null}
      </SheetBody>
      <div className="flex justify-end gap-2 bg-sunk px-5 py-3.5">
        <Button variant="quiet" size="lg" onClick={onClose}>
          Annuler
        </Button>
        <Button variant="primary" size="lg" loading={saving} onClick={() => void save()}>
          Enregistrer
        </Button>
      </div>
    </>
  );
}
