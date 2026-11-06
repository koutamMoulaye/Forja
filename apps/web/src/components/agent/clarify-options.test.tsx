import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ClarifyOptions } from "./clarify-options";
import type { MartIteration } from "@/lib/agent/view";

afterEach(() => vi.restoreAllMocks());

describe("ClarifyOptions (MT-17)", () => {
  it("reads labels and details, without duplicate React keys", () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const iteration = {
      version: 1,
      kind: "question",
      instruction: "x",
      status: "clarification",
      created_at: "2026-11-06T10:00:00Z",
      clarification: {
        question: "« 2005 » : selon quelle date du fait ?",
        term: "2005",
        options: [
          { label: "Année de fréquentation", detail: "colonne annee", ref: "time:annee" },
          { label: "Date d’appellation", detail: "colonne dateappellation", ref: "ignore" },
          { label: "Ignorer « 2005 »", detail: "", ref: "ignore" },
        ],
      },
      option_counts: [{ value: 3845164, unit: "entrées", format: "integer" }, null, null],
    } as unknown as MartIteration;
    render(<ClarifyOptions iteration={iteration} onPick={() => undefined} />);
    expect(screen.getAllByTestId("clarify-option")).toHaveLength(3);
    expect(screen.getByText("colonne dateappellation")).toBeTruthy();
    expect(screen.getByText(/845.164 entrées/)).toBeTruthy();
    expect(errors.mock.calls.flat().join(" ")).not.toMatch(/same key/);
  });
});
