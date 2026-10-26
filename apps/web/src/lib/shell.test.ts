import { describe, expect, it } from "vitest";
import { initialsOf } from "@/components/shell/shell-context";
import { fuzzyScore, paletteFilter } from "@/components/shell/command-palette";
import { dayGroup, runNotifications } from "@/components/shell/notifications";
import { breadcrumb, canOpen, parseProjectPath } from "@/lib/navigation";
import { runDuration, type Job } from "@/lib/project/use-runs";
import { formatDelay } from "@/lib/use-countdown";

const job = (patch: Partial<Job>): Job =>
  ({
    id: "run1",
    project_id: "p1",
    type: "build_gold",
    status: "succeeded",
    params: { type: "build_gold" },
    created_at: "2026-10-25T10:00:00Z",
    started_at: "2026-10-25T10:00:00Z",
    finished_at: "2026-10-25T10:02:06Z",
    ...patch,
  }) as Job;

describe("navigation", () => {
  it("reads the project and section from the path", () => {
    expect(parseProjectPath("/projects/p1/runs/r42")).toEqual({
      projectId: "p1",
      section: "runs",
      rest: ["r42"],
    });
    expect(parseProjectPath("/projects/p1")).toEqual({ projectId: "p1", section: null, rest: [] });
    expect(parseProjectPath("/auth/login")).toBeNull();
  });

  it("keeps analysts off the pipeline side and settings for admins", () => {
    expect(canOpen("analyst", "pipeline")).toBe(false);
    expect(canOpen("analyst", "marts")).toBe(true);
    expect(canOpen("engineer", "pipeline")).toBe(true);
    expect(canOpen("engineer", "home")).toBe(true);
    expect(canOpen("engineer", "settings")).toBe(false);
    expect(canOpen("admin", "settings")).toBe(true);
    expect(canOpen(null, "home")).toBe(false);
  });

  it("names the breadcrumb of nested screens", () => {
    expect(breadcrumb("model", [])).toEqual(["Modèle", "Revue du modèle en étoile"]);
    expect(breadcrumb("sources", ["s1", "plan"])).toEqual(["Sources", "Revue du plan Silver"]);
    expect(breadcrumb("marts", ["m1", "preview"])).toEqual([
      "Mes data marts",
      "Aperçu de vérification",
    ]);
  });
});

describe("shell helpers", () => {
  it("derive initials from the email", () => {
    expect(initialsOf("thomas.lefevre@exemple.fr")).toBe("TL");
    expect(initialsOf("ingenieur@demo.forja.local")).toBe("IN");
  });

  it("match palette entries without accents or case", () => {
    expect(paletteFilter("go:settings", "regl", ["Réglages"])).toBe(1);
    expect(paletteFilter("go:model", "modele etoile", ["Modèle en étoile"])).toBe(1);
    expect(paletteFilter("go:runs", "modele", ["Runs"])).toBe(0);
    // Nodes match fuzzily, best first: prefix, word start, substring, letters in order.
    expect(fuzzyScore("clients.csv", "cli")).toBe(1);
    expect(fuzzyScore("dim_clients", "cli")).toBe(0.9);
    expect(fuzzyScore("Montant par client", "lient")).toBe(0.75);
    expect(fuzzyScore("dim_clients", "dmcl")).toBe(0.4);
    expect(fuzzyScore("fct_ventes", "cli")).toBe(0);
    expect(paletteFilter("node:dim_clients", "cli", ["dim_clients", "Modèle en étoile"])).toBe(0.9);
  });

  it("write delays for people", () => {
    expect(formatDelay(45)).toBe("45 s");
    expect(formatDelay(75)).toBe("1 min 15 s");
    expect(formatDelay(120)).toBe("2 min");
    expect(formatDelay(3600)).toBe("1 h");
    expect(formatDelay(3725)).toBe("1 h 03 min");
  });

  it("time runs and announce the finished ones", () => {
    expect(runDuration(job({}))).toBe("2 min 06 s");
    const now = Date.parse("2026-10-25T12:00:00Z");
    const items = runNotifications(
      [
        job({}),
        job({
          id: "run2",
          status: "failed",
          error: "Colonne prix_ht introuvable",
          type: "build_silver",
        }),
        job({ id: "run3", status: "running", finished_at: null }),
        job({ id: "old", finished_at: "2026-10-20T10:00:00Z" }),
      ],
      "p1",
      now,
    );
    expect(items.map((item) => item.title)).toEqual(["Modèle construit", "Échec du nettoyage"]);
    expect(items[1]).toMatchObject({
      detail: "Colonne prix_ht introuvable",
      action: { label: "Corriger", href: "/projects/p1/runs/run2" },
    });
  });

  it("group notifications by day", () => {
    const now = new Date("2026-10-25T12:00:00");
    expect(dayGroup(null, now)).toBe("pending");
    expect(dayGroup(new Date("2026-10-25T08:00:00").toISOString(), now)).toBe("today");
    expect(dayGroup(new Date("2026-10-24T18:00:00").toISOString(), now)).toBe("yesterday");
  });
});
