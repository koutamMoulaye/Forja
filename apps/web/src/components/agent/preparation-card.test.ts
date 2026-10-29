import { describe, expect, it } from "vitest";
import type { AgentStep } from "@/lib/agent/steps";
import type { MartIteration } from "@/lib/agent/view";
import { stepAnnouncement } from "./preparation-card";

const step = (state: AgentStep["state"], title: string) => ({ state, title }) as AgentStep;

describe("agent announcements", () => {
  it("speaks the step in progress, then the outcome", () => {
    const working = { status: "processing", kind: "question" } as MartIteration;
    const steps = [
      step("done", "Compréhension"),
      step("run", "Recherche des données"),
      step("idle", "Aperçu"),
    ];
    expect(stepAnnouncement(working, steps)).toBe("Étape 2 sur 3 : Recherche des données");
    const ready = { status: "previewed", kind: "question" } as MartIteration;
    expect(stepAnnouncement(ready, steps)).not.toMatch(/^Étape/);
  });
});
