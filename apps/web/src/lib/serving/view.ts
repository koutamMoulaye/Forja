import type { Job } from "@/lib/project/use-runs";
import type { MartRequest, WarehouseTable } from "@/lib/project/queries";

export type LayerFilter = "gold" | "all";

/** Gold tables and published marts always; Silver tables when asked. */
export function servingTables(tables: WarehouseTable[], filter: LayerFilter): WarehouseTable[] {
  const order = { gold: 0, mart: 1, silver: 2 } as const;
  return tables
    .filter((t) => t.layer !== "mart")
    .filter((t) => filter === "all" || t.layer === "gold" || t.publish)
    .sort(
      (a, b) =>
        order[a.layer ?? "silver"] - order[b.layer ?? "silver"] || a.name.localeCompare(b.name),
    );
}

export function publishedMarts(marts: MartRequest[]): MartRequest[] {
  return marts.filter((m) => m.status === "published" && m.published_table_id);
}

export const LAYER_LABELS: Record<NonNullable<WarehouseTable["layer"]>, string> = {
  silver: "Silver",
  gold: "Gold",
  mart: "Data mart",
};

/** The latest run that wrote the serving database, and where. */
export function lastPublication(runs: Job[]): { run: Job; path: string } | null {
  for (const run of runs) {
    if (run.status === "succeeded" && run.metrics?.serving_path) {
      return { run, path: run.metrics.serving_path };
    }
  }
  return null;
}

export type Tool = "powerbi" | "superset" | "metabase";

export type ConnectStep = { text: string; code?: string };

/** Connection steps of docs/bi.md, with the real path of the serving database. */
export function connectSteps(tool: Tool, path: string): ConnectStep[] {
  const file = path.split(/[\\/]/).pop() ?? "projet.duckdb";
  const container = `/forja/serving/${file}`;
  switch (tool) {
    case "powerbi":
      return [
        {
          text: "Installez le pilote DuckDB ODBC pour Windows x64, en version 2.0 ou plus récente.",
        },
        {
          text: "Dans Sources de données ODBC (64 bits), ajoutez un DSN utilisateur « DuckDB Driver » avec ce fichier et l’option de lecture seule :",
          code: `Driver={DuckDB Driver};Database=${path};access_mode=READ_ONLY`,
        },
        {
          text: "Dans Power BI Desktop : Obtenir des données, ODBC, choisissez le DSN puis les tables. Le mode Importation est recommandé.",
        },
        {
          text: "Reliez chaque clé du fait à sa dimension (plusieurs-à-un) et marquez dim_date comme table de dates.",
        },
      ];
    case "superset":
      return [
        {
          text: "Ajoutez le dialecte DuckDB à l’image Superset :",
          code: "pip install duckdb-engine",
        },
        {
          text: "Montez le dossier serving en lecture seule dans le conteneur :",
          code: `volumes:\n  - ${path.replace(/[\\/][^\\/]+$/, "")}:/forja/serving:ro`,
        },
        {
          text: "Settings, Database Connections, + Database, Other, avec l’URI :",
          code: `duckdb:///${container}?access_mode=read_only`,
        },
      ];
    case "metabase":
      return [
        {
          text: "Déposez le pilote communautaire DuckDB (metabase_duckdb_driver) dans plugins/, puis redémarrez Metabase.",
        },
        {
          text: "Montez le dossier serving en lecture seule dans le conteneur, comme pour Superset.",
        },
        {
          text: "Admin, Databases, Add database, DuckDB, avec ce fichier et la lecture seule activée :",
          code: container,
        },
      ];
  }
}
