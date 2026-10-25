import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { STATUS_KINDS, StatusBadge, statusTier, type StatusKind } from "./status-badge";

describe("StatusBadge", () => {
  it("sorts the nine states into three levels of importance", () => {
    const byTier = (tier: string) => STATUS_KINDS.filter((k) => statusTier(k) === tier);
    expect(byTier("critical")).toEqual(["err", "prop", "warn"]);
    expect(byTier("active")).toEqual(["run", "pii"]);
    expect(byTier("calm")).toEqual(["val", "app", "pub", "rej", "queue"]);
  });

  it.each<[StatusKind, string]>([
    ["err", "Erreur"],
    ["prop", "À revoir"],
    ["warn", "À surveiller"],
    ["run", "En cours"],
    ["pii", "Pseudonymisé"],
    ["val", "Validé"],
    ["app", "Appliqué"],
    ["rej", "Rejeté"],
    ["queue", "En attente"],
  ])("labels %s as « %s »", (kind, label) => {
    render(<StatusBadge kind={kind} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it("draws critical and active states as pills sized from the font", () => {
    render(<StatusBadge kind="prop" size={13} />);
    const pill = screen.getByText("À revoir");
    expect(pill).toHaveStyle({ height: "24px", padding: "0px 9px 0px 7px" });
    expect(pill.className).toContain("border-dashed");
  });

  it("keeps calm states as icon and text", () => {
    render(<StatusBadge kind="app" label="Réussi" />);
    const calm = screen.getByText("Réussi");
    expect(calm.className).not.toContain("rounded-full");
    expect(calm.style.height).toBe("");
  });
});
