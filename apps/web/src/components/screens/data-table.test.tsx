import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DataTable, isIdentifierColumn } from "./data-table";

describe("DataTable", () => {
  it("writes headers in the interface font and identifier values in mono", () => {
    render(
      <DataTable
        label="Échantillon"
        columns={["client_id", "ville", "montant"]}
        rows={[{ client_id: "C-001", ville: "Lyon", montant: 12.5 }]}
      />,
    );
    const header = screen.getByRole("columnheader", { name: "client_id" });
    expect(header.innerHTML).not.toContain("font-mono");
    expect(screen.getByRole("cell", { name: "C-001" }).className).toContain("font-mono");
    expect(screen.getByRole("cell", { name: "Lyon" }).className).not.toContain("font-mono");
  });

  it("recognizes keys and identifiers", () => {
    expect(["client_id", "id_commande", "produit_sk", "id", "cle"].every(isIdentifierColumn)).toBe(
      true,
    );
    expect(["ville", "valide", "montant", "idee"].some(isIdentifierColumn)).toBe(false);
  });
});
