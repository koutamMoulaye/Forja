import { describe, expect, it } from "vitest";
import type { Connection, Schedule } from "@/lib/connections/queries";
import { needsChunks } from "@/lib/uploads/chunked";
import { progressLabel } from "@/lib/uploads/send";
import { authSecret, connectionState, formatNext, nextLoad, originIcon } from "./view";

const schedule = (patch: Partial<Schedule>): Schedule => ({
  id: "s",
  project_id: "p",
  target_type: "connection",
  target_id: "c1",
  spec: { kind: "daily", minute: 0, hour: 6, weekdays: [0], cron: null },
  text: "tous les jours à 6 h",
  timezone: "Europe/Paris",
  enabled: true,
  description: "Tous les jours à 06:00",
  next_run_at: "2026-11-02T05:00:00Z",
  last_run_at: null,
  last_job_id: null,
  last_status: null,
  created_by: null,
  created_at: "2026-11-01T10:00:00Z",
  updated_at: "2026-11-01T10:00:00Z",
  ...patch,
});

const connection = (patch: Partial<Connection>): Connection =>
  ({
    id: "c1",
    project_id: "p",
    name: "Boutique",
    type: "postgres",
    params: { host: "db", database: "shop", username: "r", port: null, ssl: "prefer" },
    secrets_set: ["password"],
    created_by: null,
    created_at: "2026-11-01T10:00:00Z",
    updated_at: "2026-11-01T10:00:00Z",
    last_test: null,
    sources: [],
    schedule: null,
    active_run: null,
    last_loaded_at: null,
    ...patch,
  }) as Connection;

describe("schedules", () => {
  it("says when the next load comes", () => {
    const now = new Date("2026-11-01T12:00:00");
    expect(formatNext("2026-11-01T18:30:00", now)).toBe("Auj. 18:30");
    expect(formatNext("2026-11-02T06:00:00", now)).toBe("Demain 06:00");
    expect(formatNext("2026-11-05T06:00:00", now)).toMatch(/^jeu\. 05\/11 06:00$/);
  });

  it("takes the soonest of the source's and the connection's schedules", () => {
    const own = schedule({
      id: "own",
      target_type: "source",
      target_id: "src",
      next_run_at: "2026-11-03T05:00:00Z",
    });
    const shared = schedule({});
    expect(nextLoad([own, shared], "src", "c1")?.id).toBe(shared.id);
    expect(nextLoad([own], "src", "c1")).toBe(own);
    expect(nextLoad([shared], "other", "c2")).toBeNull();
    expect(nextLoad([schedule({ enabled: false })], "src", "c1")).toBeNull();
  });
});

describe("connections", () => {
  it("reads as running, unreachable, never loaded or active", () => {
    expect(connectionState(connection({})).label).toBe("Jamais chargée");
    expect(
      connectionState(
        connection({
          last_test: { ok: false, message: "x", duration_ms: 3, tested_at: "2026-11-01T10:00:00Z" },
        }),
      ).kind,
    ).toBe("err");
    const loaded = connection({
      sources: [
        {
          source_id: "s",
          source_name: "orders",
          loaded: true,
          object: "sales.orders",
          mode: "full",
          cursor_column: null,
          last_loaded_at: null,
          last_rows: 10,
        },
      ],
    });
    expect(connectionState(loaded).label).toBe("Active");
    expect(
      connectionState({ ...loaded, active_run: { id: "r" } as Connection["active_run"] }).kind,
    ).toBe("run");
  });

  it("asks the secret of each authentication", () => {
    expect(authSecret("bearer")?.field).toBe("token");
    expect(authSecret("oauth2_client_credentials")?.field).toBe("client_secret");
    expect(authSecret("none")).toBeNull();
    expect(originIcon("csv")).toBeNull();
    expect(originIcon("api")).not.toBeNull();
  });
});

describe("uploads", () => {
  it("sends files larger than a chunk in chunks", () => {
    const file = (size: number) => ({ size }) as File;
    expect(needsChunks(file(9 * 1024 * 1024), 8)).toBe(true);
    expect(needsChunks(file(8 * 1024 * 1024), 8)).toBe(false);
    expect(needsChunks(file(10 ** 10), null)).toBe(false);
  });

  it("labels the progress", () => {
    expect(progressLabel({ sent: 42, total: 100, state: "sending" })).toBe("Envoi 42 %");
    expect(progressLabel({ sent: 42, total: 100, state: "resuming" })).toMatch(/reprise/);
    expect(progressLabel(undefined)).toBeNull();
  });
});
