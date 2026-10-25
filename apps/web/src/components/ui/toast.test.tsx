import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ToastCard } from "./toast";

describe("ToastCard", () => {
  it("announces errors and runs their action", async () => {
    const onClick = vi.fn();
    const onDismiss = vi.fn();
    render(
      <ToastCard
        tone="error"
        title="Échec du nettoyage de produits"
        description="Colonne prix_ht introuvable"
        action={{ label: "Corriger", onClick }}
        onDismiss={onDismiss}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Échec du nettoyage de produits");
    await userEvent.click(screen.getByRole("button", { name: "Corriger" }));
    expect(onClick).toHaveBeenCalled();
    expect(onDismiss).toHaveBeenCalled();
  });

  it("uses a polite status for successes", () => {
    render(<ToastCard tone="success" title="Modèle validé" />);
    expect(screen.getByRole("status")).toHaveTextContent("Modèle validé");
  });
});
