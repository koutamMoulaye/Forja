import { describe, expect, it } from "vitest";
import type { components } from "@/lib/api/schema";
import { formatClock, formatRatio, formatWhen, matchesQuery, plural, shortValue } from "./format";
import { NO_FILTER, auditFacets, filterAudit, personalDataMap } from "./governance/view";
import { diffGold, issueTarget, originView, starLayout } from "./model/view";
import { logLines, matchesRunFilter, runFigures, runSteps, runTests } from "./runs/view";
import { synonymWarnings, metricRows } from "./semantic/view";
import { connectSteps, lastPublication, servingTables } from "./serving/view";
import {
  diffPlans,
  highConfidencePending,
  matchesRuleFilter,
  paramsPatch,
  ruleExamples,
  ruleLabel,
  withDecisions,
} from "./silver/review";
import { driftLines, driftSummary, matchesSourceFilter, planBadge } from "./sources/view";

type S = components["schemas"];

const rule = (over: Partial<S["ReviewRule"]> = {}): S["ReviewRule"] => ({
  id: "cast:date",
  kind: "cast",
  title: "Convertir en date",
  explanation: "",
  columns: ["date"],
  confidence: "high",
  decision: null,
  rejectable: true,
  affected: null,
  ...over,
});

describe("format", () => {
  it("writes French numbers, ratios and clocks", () => {
    expect(plural(1, "règle", "règles")).toBe("1 règle");
    expect(plural(4812, "ligne", "lignes")).toBe("4\u202f812 lignes");
    expect(formatRatio(0.943)).toBe("94 %");
    expect(formatRatio(0.9995)).toBe("99,9 %");
    expect(formatClock(48)).toBe("0:48");
    expect(formatClock(3725)).toBe("1:02:05");
  });

  it("dates runs as in the list", () => {
    const now = new Date(2026, 9, 27, 18, 0);
    expect(formatWhen(new Date(2026, 9, 27, 10, 42).toISOString(), now)).toBe("Auj. 10:42");
    expect(formatWhen(new Date(2026, 9, 26, 16, 58).toISOString(), now)).toBe("Hier 16:58");
    expect(formatWhen(new Date(2026, 9, 22, 14, 5).toISOString(), now)).toBe("22/10 14:05");
  });

  it("searches without accents and shortens pseudonyms", () => {
    expect(matchesQuery("vérité", "Verite")).toBe(true);
    expect(shortValue("a".repeat(64))).toBe("aaaaaaaaaa…");
    expect(shortValue(null)).toBe("(vide)");
  });
});

describe("sources", () => {
  const source = {
    schema_drift: {
      previous_version: 1,
      added: ["siret"],
      removed: [],
      type_changed: [],
      has_drift: true,
    },
  } as unknown as S["Source"];
  it("reads plan states and drift", () => {
    expect(planBadge(null)).toEqual({ kind: "queue", label: "En préparation" });
    expect(planBadge({ status: "draft" } as S["TransformationPlan"]).label).toBe("À revoir");
    expect(driftLines({ schema_drift: source.schema_drift })).toEqual([
      { tone: "add", text: "siret ajoutée" },
    ]);
    expect(driftSummary({ version: 2, schema_drift: source.schema_drift })).toBe(
      "1 colonne ajoutée",
    );
    expect(driftSummary({ version: 1, schema_drift: null })).toBe("Première version");
  });
  it("filters the list", () => {
    const draft = { status: "draft" } as S["TransformationPlan"];
    expect(matchesSourceFilter("review", source, draft, 0)).toBe(true);
    expect(matchesSourceFilter("pii", source, draft, 0)).toBe(false);
    expect(matchesSourceFilter("drift", source, null, 0)).toBe(true);
  });
});

describe("Silver review", () => {
  it("labels, filters and decides rules", () => {
    expect(ruleLabel(0)).toBe("R-01");
    const rules = [
      rule(),
      rule({ id: "pii:email", kind: "pii", confidence: "medium" }),
      rule({ id: "dedup", decision: "validated" }),
    ];
    expect(rules.filter((r) => matchesRuleFilter("pending", r))).toHaveLength(2);
    expect(highConfidencePending(rules).map((r) => r.id)).toEqual(["cast:date"]);
    const review = { rules, pending: 2, validated: 1, rejected: 0 };
    const decided = withDecisions(review, { "cast:date": "rejected", dedup: null });
    expect(decided).toMatchObject({ pending: 2, validated: 0, rejected: 1 });
  });

  it("shows before and after values, plain columns first", () => {
    const samples = {
      source_id: "s",
      plan_version: 1,
      sample_rows: 10,
      columns: [
        {
          column: "nom",
          target_column: "nom",
          personal: true,
          treatment: "hash",
          values: [{ before: "D***", after: "f".repeat(64), invalid: false, count: 1 }],
        },
        {
          column: "ville",
          target_column: "ville",
          personal: false,
          treatment: "none",
          values: [
            { before: " Lyon", after: "Lyon", invalid: false, count: 2 },
            { before: "Paris", after: "Paris", invalid: false, count: 1 },
          ],
        },
        {
          column: "date",
          target_column: "date",
          personal: false,
          treatment: "none",
          values: [{ before: "31/02/2024", after: null, invalid: true, count: 1 }],
        },
      ],
    } as S["PlanSamples"];
    expect(ruleExamples(rule({ kind: "normalize", columns: ["nom", "ville"] }), samples)).toEqual([
      { column: "ville", before: " Lyon", after: "Lyon", invalid: false, personal: false },
    ]);
    expect(ruleExamples(rule(), samples)[0]).toMatchObject({
      after: "vide · valeur impossible",
      invalid: true,
    });
  });

  it("turns chosen settings into a plan patch", () => {
    expect(paramsPatch(rule(), { date_format: "%d-%m-%Y", invalid: "empty" })).toEqual({
      columns: { date: { date_format: "%d-%m-%Y", rules: { castable: false } } },
    });
    expect(
      paramsPatch(rule({ kind: "normalize", columns: ["a", "b"] }), { normalization: "trim" })
        .columns,
    ).toEqual({
      a: { normalization: "trim" },
      b: { normalization: "trim" },
    });
  });

  it("compares two plan versions", () => {
    const column = {
      source_column: "date",
      target_column: "date",
      included: true,
      target_type: "date",
      normalization: "none",
      pii_treatment: "none",
      cast: { date_format: "%d/%m/%Y" },
      rules: [{ kind: "castable", enabled: true }],
    };
    const before = {
      columns: [column],
      primary_key: { columns: ["id"] },
      deduplication: { enabled: true },
    } as unknown as S["TransformationPlan"];
    const after = {
      columns: [
        { ...column, target_type: "varchar", rules: [{ kind: "castable", enabled: false }] },
      ],
      primary_key: null,
      deduplication: { enabled: true },
    } as unknown as S["TransformationPlan"];
    expect(diffPlans(before, after).map((c) => c.text)).toEqual([
      "type date → texte",
      "règle castable désactivée",
      "clé primaire retirée",
    ]);
  });
});

describe("star schema", () => {
  it("places dimensions on both sides without covering the fact", () => {
    const geometry = starLayout(3, 900, { width: 272, height: 420 }, { width: 200, height: 146 });
    expect(geometry.dimensions[0]!.x + 200).toBeLessThanOrEqual(geometry.fact.x);
    expect(geometry.dimensions[1]!.x).toBeGreaterThanOrEqual(geometry.fact.x + 272);
    expect(geometry.dimensions[2]!.y).toBeGreaterThanOrEqual(geometry.dimensions[0]!.y + 146);
    expect(geometry.height).toBeGreaterThanOrEqual(420);
    expect(
      starLayout(2, 300, { width: 272, height: 100 }, { width: 200, height: 146 }).width,
    ).toBeGreaterThan(300);
  });

  it("links an issue to what can solve it", () => {
    const plan = {
      dimensions: [{ name: "dim_clients", source: "clients" }],
      facts: [
        {
          name: "fct_ventes",
          foreign_keys: [
            {
              name: "client_key",
              dimension: "dim_clients",
              source: "commandes",
              column: "id_client",
            },
          ],
          measures: [],
        },
      ],
    } as unknown as S["GoldPlan"];
    const relation = {
      id: "r1",
      from_source: "commandes",
      from_column: "id_client",
      to_source: "clients",
    } as S["Relation"];
    const issue = (location: string) =>
      ({ severity: "error", code: "x", message: "", location }) as S["ValidationIssue"];
    expect(
      issueTarget(issue("facts.fct_ventes.foreign_keys.client_key"), plan, [relation]),
    ).toEqual({ kind: "relation", relation });
    expect(issueTarget(issue("facts.fct_ventes.measures.montant"), plan, [])).toEqual({
      kind: "measure",
      fact: "fct_ventes",
      measure: "montant",
    });
    expect(issueTarget(issue("dimensions.dim_x"), plan, [])).toEqual({
      kind: "dimension",
      dimension: "dim_x",
    });
  });

  it("names the origin of a proposal and the changes between versions", () => {
    expect(originView("heuristic").kind).toBe("heuristic");
    expect(originView("llm:ollama/mistral-small3:24b")).toMatchObject({
      kind: "local",
      title: "IA locale",
    });
    expect(originView("llm:anthropic/claude-opus-5-5").title).toBe("IA cloud, Anthropic");
    const v1 = {
      dimensions: [{ name: "dim_a", scd: "scd1", attributes: [] }],
      facts: [{ name: "f", measures: [{ name: "m", expression: "x", aggregation: "sum" }] }],
    } as unknown as S["GoldPlan"];
    const v2 = {
      dimensions: [{ name: "dim_a", scd: "scd2", attributes: [] }],
      facts: [{ name: "f", measures: [] }],
    } as unknown as S["GoldPlan"];
    expect(diffGold(v1, v2)).toEqual([
      "dim_a : SCD1, écrasée → SCD2, historisée",
      "mesure m retirée",
    ]);
  });
});

describe("runs", () => {
  const run = {
    id: "abcdef123456",
    type: "build_silver",
    status: "succeeded",
    params: { type: "build_silver" },
    created_at: "2026-10-27T10:00:00Z",
    metrics: {
      rows_read: 6210,
      rows_valid: 6188,
      rows_rejected: 19,
      duplicates_removed: 3,
      sources: [{ model: "stg_commandes", rows_valid: 6188, model_status: "success" }],
      models: [],
      unknown_member_rows: [{ fact: "f", key: "k", dimension: "d", rows: 372 }],
      dbt_tests: {
        passed: 1,
        failed: 1,
        results: [
          { unique_id: "a", name: "unique_x", status: "pass" },
          { unique_id: "b", name: "not_null_y", status: "fail", failures: 2 },
        ],
      },
    },
  } as unknown as S["Job"];
  it("filters, steps, figures and tests", () => {
    expect(matchesRunFilter("failed", run)).toBe(false);
    expect(runSteps(run)).toEqual([
      { name: "Nettoyage de commandes", state: "done", detail: "6\u202f188 lignes" },
    ]);
    expect(runFigures(run).map((f) => f.value)).toEqual([
      "6\u202f210",
      "6\u202f188",
      "19",
      "3",
      "372",
    ]);
    const tests = runTests(run);
    expect(tests.rows[0]).toEqual({
      name: "not_null_y",
      outcome: "fail",
      detail: "2 lignes en défaut",
    });
    expect(tests.summary).toBe("1 réussi, 1 en échec");
  });
  it("searches the log and marks levels", () => {
    const lines = logLines(
      "10:42 INFO Lecture\n10:43 WARN 19 lignes rejetées\n10:44 ERROR échec",
      "rejetees",
    );
    expect(lines).toEqual([{ text: "10:43 WARN 19 lignes rejetées", level: "warn" }]);
  });
});

describe("serving", () => {
  const table = (name: string, layer: "gold" | "silver" | "mart", publish: boolean) =>
    ({ id: name, name, layer, publish }) as S["WarehouseTable"];
  it("shows Gold by default, Silver on demand, never marts", () => {
    const tables = [
      table("stg_clients", "silver", false),
      table("dim_clients", "gold", true),
      table("mart_x", "mart", true),
    ];
    expect(servingTables(tables, "gold").map((t) => t.name)).toEqual(["dim_clients"]);
    expect(servingTables(tables, "all").map((t) => t.name)).toEqual(["dim_clients", "stg_clients"]);
  });
  it("finds the serving path and writes the connection steps", () => {
    const runs = [
      { status: "failed" },
      { status: "succeeded", metrics: { serving_path: "C:\\forja\\serving\\demo.duckdb" } },
    ] as S["Job"][];
    expect(lastPublication(runs)?.path).toBe("C:\\forja\\serving\\demo.duckdb");
    expect(connectSteps("powerbi", "C:\\forja\\serving\\demo.duckdb")[1]!.code).toContain(
      "Database=C:\\forja\\serving\\demo.duckdb;access_mode=READ_ONLY",
    );
    expect(connectSteps("superset", "/data/serving/demo.duckdb")[2]!.code).toBe(
      "duckdb:////forja/serving/demo.duckdb?access_mode=read_only",
    );
  });
});

describe("semantic layer", () => {
  const layer = {
    metrics: [
      {
        name: "montant",
        label: "Chiffre d’affaires",
        description: "Montant HT",
        formula: "sum(montant)",
        additivity: "additive",
        kind: "aggregate",
        synonyms: ["CA"],
        fact: "f",
      },
      {
        name: "panier",
        label: "Panier moyen",
        formula: "a / b",
        additivity: "non_additive",
        kind: "ratio",
        synonyms: [],
        fact: "f",
      },
    ],
    dimensions: [],
  } as unknown as S["SemanticLayer"];
  const proposal = (target: string, synonym: string) =>
    ({ id: "p", target, synonym, status: "pending" }) as S["SynonymProposal"];
  it("warns about misleading synonyms", () => {
    expect(synonymWarnings(layer, proposal("metric:montant", "CA TTC"))).toEqual([
      "Chiffre d’affaires est hors taxes : ce synonyme serait trompeur.",
    ]);
    expect(synonymWarnings(layer, proposal("metric:panier", "ca"))[0]).toContain(
      "désigne déjà Chiffre d’affaires",
    );
    expect(synonymWarnings(layer, proposal("metric:montant", "panier moyen"))).toHaveLength(2);
  });
  it("counts the data marts using a metric", () => {
    const marts = [
      { status: "published", iterations: [{ spec: { metrics: ["montant"], axes: [] } }] },
    ] as unknown as S["MartRequest"][];
    expect(metricRows(layer, marts).map((r) => r.marts)).toEqual([1, 0]);
  });
});

describe("governance", () => {
  const entry = (over: Partial<S["AuditEntry"]>) =>
    ({
      id: "1",
      at: "2026-10-27T10:00:00Z",
      action: "source.upload",
      user_email: "a@x.fr",
      details: {},
      ...over,
    }) as S["AuditEntry"];
  it("filters the audit log", () => {
    const entries = [
      entry({ details: { filename: "clients.csv" } }),
      entry({
        id: "2",
        action: "table.export",
        user_email: null,
        object_type: "table",
        at: "2026-09-01T10:00:00Z",
      }),
    ];
    const now = Date.parse("2026-10-27T12:00:00Z");
    expect(filterAudit(entries, { ...NO_FILTER, query: "clients" }, now)).toHaveLength(1);
    expect(filterAudit(entries, { ...NO_FILTER, user: "système" }, now).map((e) => e.id)).toEqual([
      "2",
    ]);
    expect(filterAudit(entries, { ...NO_FILTER, period: "week" }, now).map((e) => e.id)).toEqual([
      "1",
    ]);
    expect(auditFacets(entries).objects).toEqual(["table"]);
  });
  it("maps personal columns by layer", () => {
    const plan = {
      source_name: "clients",
      columns: [
        {
          target_column: "email",
          pii_type: "email",
          pii_level: "high",
          pii_treatment: "none",
          included: true,
        },
      ],
    } as unknown as S["TransformationPlan"];
    const gold = {
      dimensions: [
        {
          name: "dim_clients",
          source: "clients",
          attributes: [{ column: "email", name: "email", pii_treatment: "hash" }],
        },
      ],
    } as unknown as S["GoldPlan"];
    expect(personalDataMap([plan], gold)[0]).toMatchObject({
      gold: "Pseudonymisée (dim_clients)",
      serving: "En clair",
      analyst: "Pseudonymisée",
      exposed: true,
    });
  });
});
