import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Button } from "./button";

describe("Button", () => {
  it("defaults to the secondary variant", () => {
    render(<Button>Modifier</Button>);
    expect(screen.getByRole("button", { name: "Modifier" })).toHaveAttribute(
      "data-variant",
      "secondary",
    );
  });

  it("is busy and inert while loading", async () => {
    const onClick = vi.fn();
    render(
      <Button variant="primary" loading onClick={onClick}>
        Se connecter
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Se connecter" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("renders its child when asChild is set", () => {
    render(
      <Button asChild variant="link">
        <a href="/runs">Voir le run</a>
      </Button>,
    );
    expect(screen.getByRole("link", { name: "Voir le run" })).toHaveAttribute("href", "/runs");
  });
});
