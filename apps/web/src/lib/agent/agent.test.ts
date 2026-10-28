import { describe, expect, it } from "vitest";
import { registrationChecks } from "@/components/auth/password-form";
import { describeRef } from "@/components/agent/clarify-options";
import { agentNotifications } from "@/components/shell/notifications";
import { invitationProblem } from "@/lib/auth/invitation";
import type { SemanticLayer } from "@/lib/project/queries";
import type { Job } from "@/lib/project/use-runs";
import { catalog, questionWith, searchCatalog } from "./catalog";
import { agentHeadline, agentMeta, agentSteps } from "./steps";
import {
  businessDescription,
  controlLabel,
  controlOutcome,
  controlsSummary,
  conversationOutcome,
  countByFilter,
  destinationLabel,
  filterMarts,
  formatOptionCount,
  freshnessLabel,
  greetingName,
  lineage,
  mainTotal,
  martBadge,
  martTitle,
  pathLabel,
  pickSuggestions,
  refineSuggestions,
  type Control,
  type MartIteration,
  type MartRequest,
} from "./view";

const NOW = "2026-10-28T10:00:00Z";

function iteration(over: Partial<MartIteration> = {}): MartIteration {
  return {
    version: 1,
    kind: "question",
    instruction: "ventes par ville",
    effective: "ventes par ville",
    status: "processing",
    created_at: NOW,
    ...over,
  } as MartIteration;
}

function request(over: Partial<MartRequest> = {}, iterations = [iteration()]): MartRequest {
  return {
    id: "m1",
    project_id: "p1",
    owner_id: "u1",
    question: "ventes par ville",
    status: "drafted",
    iterations,
    created_at: NOW,
    updated_at: NOW,
    ...over,
  } as MartRequest;
}

function job(step: string | null, status: Job["status"] = "running", over: Partial<Job> = {}): Job {
  return {
    id: "j1",
    project_id: "p1",
    type: "mart_request",
    status,
    params: { type: "mart_request" },
    created_at: NOW,
    started_at: NOW,
    progress: step ? { step, percent: 50 } : null,
    ...over,
  } as Job;
}

const control = (code: string, status: Control["status"], message: string, details = {}) =>
  ({ code, status, message, details }) as Control;

const PREVIEW = {
  row_count: 156,
  columns: [
    { name: "mois", kind: "axis", label: "Mois", ref: "time:date_commande.mois" },
    { name: "ville", kind: "axis", label: "Ville (client)", ref: "attribute:client.ville" },
    { name: "montant", kind: "metric", label: "Chiffre d'affaires", ref: "metric:montant" },
  ],
  rows: [],
  controls: [
    control("reconciliation", "ok", "Chiffre d'affaires : total du data mart 2 418 650.30 = …", {
      metric: "montant",
      mart_total: 2418650.3,
    }),
    control(
      "unknown_member",
      "warning",
      "3 ligne(s) … rattachée(s) au membre inconnu de client : …",
    ),
    control("null_column", "ok", "Aucune colonne vide."),
  ],
} as unknown as MartIteration["preview"];

describe("agent steps", () => {
  it("follows the job: queued, pre-selection, language model, construction, checks", () => {
    const states = (step: string | null, status: Job["status"] = "running") =>
      agentSteps(iteration(), job(step, status)).map((s) => s.state);
    expect(states(null, "queued")).toEqual(["run", "idle", "idle", "idle", "idle", "idle"]);
    expect(states("preselection")).toEqual(["done", "run", "idle", "idle", "idle", "idle"]);
    expect(states("validation")).toEqual(["done", "done", "done", "run", "idle", "idle"]);
    expect(states("preview")).toEqual(["done", "done", "done", "done", "run", "idle"]);
    const deep = agentSteps(iteration(), job("llm"));
    expect(deep[1]!.state).toBe("run");
    expect(deep[1]!.detail).toMatch(/Analyse approfondie/);
  });

  it("stops on a question back, then reads the answer", () => {
    const asked = agentSteps(
      iteration({
        status: "clarification",
        clarification: {
          question: "Que voulez-vous dire par « ventes » ?",
          term: "ventes",
          options: [],
        },
      }),
    );
    expect(asked.map((s) => s.state)).toEqual(["done", "done", "wait", "idle", "idle", "idle"]);
    expect(asked[2]!.detail).toBe("Que voulez-vous dire par « ventes » ?");
    const answered = agentSteps(
      iteration({
        kind: "answer",
        instruction: "Chiffre d'affaires",
        status: "previewed",
        preview: PREVIEW,
      }),
    );
    expect(answered.every((s) => s.state === "done")).toBe(true);
    expect(answered[0]!.title).toBe("Prise en compte de votre précision");
    expect(answered[2]).toMatchObject({ title: "Précision reçue", detail: "Chiffre d'affaires" });
    expect(answered[3]!.detail).toBe("156 lignes · 3 colonnes");
    expect(answered[4]!.detail).toBe("2 contrôles réussis, 1 à surveiller");
  });

  it("marks a refusal, a failure and a cancellation", () => {
    const refused = agentSteps(iteration({ status: "refused", refusal: "Hors périmètre." }));
    expect(refused[1]).toMatchObject({ state: "fail", detail: "Hors périmètre." });
    const cancelled = iteration({ status: "failed", error: "annulée" });
    const steps = agentSteps(cancelled, job("llm", "cancelled"));
    expect(steps[1]).toMatchObject({ state: "fail", detail: "Annulée à votre demande" });
    expect(agentHeadline(cancelled)).toBe("Préparation annulée");
    expect(agentHeadline(iteration({ status: "clarification" }))).toBe(
      "En pause, une question pour vous",
    );
  });

  it("says the path without jargon and counts the time", () => {
    const now = Date.parse(NOW) + 75_000;
    expect(agentMeta(iteration(), job("llm"), now)).toBe("1 min 15 s");
    const done = iteration({ status: "previewed", path: "llm" });
    expect(agentMeta(done, job(null, "succeeded", { finished_at: "2026-10-28T10:01:34Z" }))).toBe(
      "Analyse approfondie · en 1 min 34 s",
    );
    expect(pathLabel("parser")).toBe("Réponse immédiate");
    expect(pathLabel("llm_cache")).toMatch(/^Réponse immédiate/);
  });
});

describe("data marts", () => {
  const previewed = iteration({
    status: "previewed",
    preview: PREVIEW,
    summary: "Chiffre d'affaires par mois et par ville, sur 2025, clients segment professionnel.",
  });
  const marts = [
    request({ id: "a", status: "previewed", updated_at: "2026-10-27T10:00:00Z" }, [previewed]),
    request({ id: "b", status: "validated", updated_at: "2026-10-28T09:00:00Z" }, [previewed]),
    request({ id: "c", status: "published", updated_at: "2026-10-26T09:00:00Z" }, [previewed]),
    request({ id: "d", status: "rejected", updated_at: "2026-10-28T08:00:00Z" }, [previewed]),
    request({ id: "e" }),
  ];

  it("filters by group, newest first, and counts each group", () => {
    expect(filterMarts(marts, "all").map((m) => m.id)).toEqual(["e", "b", "d", "a", "c"]);
    expect(filterMarts(marts, "draft").map((m) => m.id)).toEqual(["e", "a"]);
    expect(filterMarts(marts, "pending").map((m) => m.id)).toEqual(["b"]);
    expect(filterMarts(marts, "published").map((m) => m.id)).toEqual(["c"]);
    expect(countByFilter(marts)).toEqual({ all: 5, draft: 2, pending: 1, published: 1 });
  });

  it("names a mart from its summary and reads its status", () => {
    expect(martTitle(marts[0]!)).toBe("Chiffre d'affaires par mois et par ville");
    expect(martTitle(marts[4]!)).toBe("ventes par ville");
    const parts = request({ status: "previewed" }, [
      iteration({
        status: "previewed",
        preview: PREVIEW,
        summary_parts: [
          { text: "Chiffre d'affaires", term: { kind: "metric" } },
          { text: " " },
          { text: "par mois", term: { kind: "grain" } },
          { text: ", " },
          { text: "par segment", term: { kind: "axis" } },
          { text: " et " },
          { text: "par ville", term: { kind: "axis", index: 1 } },
          { text: ", " },
          { text: "clients ville Lyon", term: { kind: "filter" } },
          { text: "." },
        ],
      } as Partial<MartIteration>),
    ]);
    expect(martTitle(parts)).toBe("Chiffre d'affaires par mois, par segment et par ville");
    expect(martBadge(marts[0]!)).toEqual({ kind: "prop", label: "À vérifier" });
    expect(martBadge(marts[1]!)).toEqual({ kind: "queue", label: "En attente d’approbation" });
    expect(martBadge({ ...marts[1]!, publish_job_id: "j" })).toEqual({
      kind: "run",
      label: "Publication",
    });
    expect(martBadge(marts[2]!).label).toBe("Publié");
    expect(martBadge(marts[4]!)).toEqual({ kind: "run", label: "En préparation" });
    expect(destinationLabel("powerbi")).toBe("Power BI");
    expect(destinationLabel(null, true)).toBe("Base serving");
    expect(destinationLabel(null)).toBe("—");
  });

  it("tells where a conversation stands, for notices", () => {
    expect(conversationOutcome(marts[4]!).state).toBe("working");
    expect(conversationOutcome(marts[0]!)).toMatchObject({
      state: "ready",
      title: "Aperçu prêt à vérifier",
    });
    expect(conversationOutcome(marts[0]!).href("p1")).toBe("/projects/p1/marts/a/preview");
    expect(conversationOutcome(marts[1]!).state).toBe("pending");
    const asked = request({}, [iteration({ status: "clarification" })]);
    expect(conversationOutcome(asked)).toMatchObject({ state: "question", tone: "info" });
    expect(conversationOutcome(asked).href("p1")).toBe("/projects/p1/ask/m1");
    const rejected = request({ status: "rejected", rejection_reason: "doublon" }, [previewed]);
    expect(conversationOutcome(rejected)).toMatchObject({ state: "rejected", tone: "error" });
    expect(conversationOutcome(rejected).detail).toMatch(/doublon$/);

    const now = Date.parse("2026-10-28T12:00:00Z");
    const notices = agentNotifications(marts, "p1", now);
    expect(notices.map((n) => n.title)).toEqual([
      "Aperçu prêt à vérifier",
      "En attente d’approbation",
      "Data mart rejeté",
    ]);
    expect(notices[0]!.action).toEqual({ label: "Vérifier", href: "/projects/p1/marts/a/preview" });
  });
});

describe("verification preview", () => {
  it("labels and summarizes the checks", () => {
    const controls = PREVIEW!.controls!;
    expect(controls.map(controlOutcome)).toEqual(["pass", "warn", "pass"]);
    expect(controls.map(controlLabel)).toEqual([
      "Chiffre d'affaires : total exact",
      "Rattachement incomplet : client",
      "Aucune colonne vide",
    ]);
    expect(controlsSummary(controls)).toBe("2 contrôles réussis, 1 à surveiller");
    expect(controlsSummary([control("reconciliation", "error", "x")])).toBe("1 en échec");
  });

  it("finds the total, the lineage and the adjustments to offer", () => {
    const it = iteration({
      status: "previewed",
      preview: PREVIEW,
      spec: {
        metrics: ["montant"],
        axes: ["client.ville"],
        time_grain: "mois",
        filters: [{ field: "client.segment", operator: "eq", value: "professionnel" }],
        period: { label: "2025" },
      } as MartIteration["spec"],
      sql: "with base as (select … from fct_ventes as f left join dim_date as date_commande on … left join dim_clients as client on …)",
    });
    expect(mainTotal(it)).toEqual({
      metric: "montant",
      label: "Chiffre d'affaires",
      value: 2418650.3,
    });
    expect(lineage(it)).toEqual([
      { name: "fct_ventes", kind: "fact", detail: "faits" },
      { name: "dim_date", kind: "dimension", detail: "axe" },
      { name: "dim_clients", kind: "dimension", detail: "filtre appliqué" },
      { name: "Data mart", kind: "mart", detail: "156 lignes" },
    ]);
    const layer = {
      metrics: [
        { name: "montant", label: "Chiffre d'affaires", fact: "fct_ventes", default: true },
        { name: "nb_commandes", label: "Nombre de commandes", fact: "fct_ventes", default: true },
      ],
    };
    expect(refineSuggestions(it.spec, layer)).toEqual([
      "Ajoute nombre de commandes",
      "Par trimestre",
      "Seulement le T1 2025",
    ]);
    expect(refineSuggestions(null, layer)).toEqual([]);
  });

  it("formats what an option covers", () => {
    expect(formatOptionCount({ value: 1284, unit: "clients", format: "count" })).toMatch(
      /^1\s284 clients$/,
    );
    expect(formatOptionCount({ value: 4994.8, unit: "", format: "currency" })).toMatch(
      /^4\s995\s€$/,
    );
    expect(formatOptionCount(null)).toBeNull();
    expect(describeRef("metric:montant")).toBe("Une mesure");
    expect(describeRef("value:client.segment=professionnel")).toBe(
      "Valeur « professionnel » de segment",
    );
  });
});

describe("home", () => {
  it("offers the agent's suggestions, not the questions just asked", () => {
    const overview = {
      suggestions: ["CA par mois en 2024", "Top 5 des produits", "Panier moyen par segment"],
    } as Parameters<typeof pickSuggestions>[0];
    expect(pickSuggestions(overview, ["ca par mois EN 2024"])).toEqual([
      "Top 5 des produits",
      "Panier moyen par segment",
    ]);
    expect(pickSuggestions(overview, [], 1)).toEqual(["CA par mois en 2024"]);
    expect(pickSuggestions(undefined)).toEqual([]);
  });

  it("says how fresh the data is and whom it greets", () => {
    const now = new Date("2026-10-28T15:00:00");
    expect(freshnessLabel(new Date("2026-10-28T06:00:00").toISOString(), now)).toBe(
      "mis à jour ce matin à 06:00",
    );
    expect(freshnessLabel(new Date("2026-10-27T18:02:00").toISOString(), now)).toBe(
      "mis à jour hier à 18:02",
    );
    expect(freshnessLabel(new Date("2026-10-22T09:00:00").toISOString(), now)).toBe(
      "mis à jour le 22 octobre",
    );
    expect(freshnessLabel(null)).toBe("données pas encore construites");
    expect(greetingName({ name: "Claire Martin", email: "c@x.fr" })).toBe("Claire");
    expect(greetingName({ email: "claire.martin@exemple.fr" })).toBe("Claire");
  });

  it("describes a metric in business words, not as a formula", () => {
    const base = { label: "Chiffre d'affaires", formula: "sum(montant)" };
    expect(businessDescription({ ...base, description: "Montants HT, annulations exclues." })).toBe(
      "Montants HT, annulations exclues.",
    );
    expect(
      businessDescription({
        ...base,
        description: "sum(montant) sur fct_ventes",
        aggregation: "sum",
      }),
    ).toBe("Chiffre d'affaires : somme sur la période et le périmètre choisis.");
    expect(
      businessDescription({
        label: "Nombre de commandes",
        formula: "x",
        description: "",
        aggregation: "count_distinct",
      }),
    ).toBe("Nombre de commandes, chaque élément compté une seule fois.");
  });
});

describe("indicators", () => {
  const layer = {
    version: 3,
    metrics: [
      {
        name: "panier",
        label: "Panier moyen",
        description: "CA divisé par les commandes",
        formula: "x",
        fact: "f",
        kind: "ratio",
        additivity: "non_additive",
        synonyms: ["ticket moyen"],
        format: "currency",
      },
      {
        name: "montant",
        label: "Chiffre d'affaires",
        description: "",
        formula: "sum(montant)",
        fact: "f",
        aggregation: "sum",
        additivity: "additive",
        synonyms: ["CA"],
        default: true,
        format: "currency",
      },
      {
        name: "cache",
        label: "Caché",
        formula: "x",
        fact: "f",
        additivity: "additive",
        hidden: true,
      },
    ],
    dimensions: [
      {
        name: "client",
        label: "Client",
        kind: "standard",
        fact: "f",
        table: "dim_clients",
        display_attribute: "id_client",
        attributes: [
          { name: "id_client", column: "id", label: "Identifiant client", filterable: true },
          { name: "email", column: "email", label: "Email", pii: "email" },
          {
            name: "ville",
            column: "ville",
            label: "Ville",
            filterable: true,
            synonyms: ["commune"],
          },
        ],
        hierarchies: [],
      },
      {
        name: "date_commande",
        label: "Date de commande",
        kind: "time",
        fact: "f",
        table: "dim_date",
        attributes: [
          { name: "annee", column: "annee", label: "Année" },
          { name: "mois", column: "mois", label: "Mois" },
        ],
        hierarchies: [{ name: "cal", label: "Calendrier", levels: ["annee", "mois"] }],
      },
      {
        name: "commande",
        label: "Commande",
        kind: "degenerate",
        fact: "f",
        table: "f",
        attributes: [{ name: "id", column: "id", label: "Id" }],
      },
    ],
  } as unknown as SemanticLayer;

  it("lists visible metrics (default first) and business axes, without personal data", () => {
    const entries = catalog(layer);
    expect(entries.metrics.map((m) => m.name)).toEqual(["montant", "panier"]);
    expect(entries.metrics[0]!.description).toMatch(/somme/);
    expect(entries.metrics[0]!.question).toBe("Chiffre d'affaires par mois");
    expect(entries.dimensions.map((d) => d.name)).toEqual(["client", "date_commande"]);
    expect(entries.dimensions[0]!.axes.map((a) => a.label)).toEqual(["Client", "Ville"]);
    expect(entries.dimensions[1]!.hierarchies).toEqual([
      { label: "Calendrier", levels: ["Année", "Mois"] },
    ]);
    expect(questionWith(entries.metrics[0]!, entries.dimensions[0]!.axes[1])).toBe(
      "Chiffre d'affaires par ville",
    );
  });

  it("searches labels, descriptions and synonyms, accents ignored", () => {
    const entries = catalog(layer);
    expect(searchCatalog(entries, "ticket").metrics.map((m) => m.name)).toEqual(["panier"]);
    const commune = searchCatalog(entries, "COMMUNE");
    expect(commune.metrics).toEqual([]);
    expect(commune.dimensions[0]!.axes.map((a) => a.label)).toEqual(["Ville"]);
    expect(searchCatalog(entries, "  ")).toBe(entries);
  });
});

describe("registration", () => {
  it("applies the password rules of the first sign-in, with the email instead", () => {
    const ok = registrationChecks("nora@exemple.fr", "Bienvenue-2026x", "Bienvenue-2026x");
    expect(ok.every((check) => check.ok)).toBe(true);
    const weak = registrationChecks("nora@exemple.fr", "nora", "nore");
    expect(weak.map((c) => c.ok)).toEqual([false, false, false, false]);
  });

  it("explains an unusable link", () => {
    expect(invitationProblem("valid")).toBeNull();
    expect(invitationProblem("expired")!.title).toBe("Invitation expirée");
    expect(invitationProblem("revoked")!.title).toBe("Invitation révoquée");
    expect(invitationProblem("used")!.title).toBe("Invitation déjà utilisée");
    expect(invitationProblem("unknown")!.title).toBe("Lien d’invitation inconnu");
  });
});
