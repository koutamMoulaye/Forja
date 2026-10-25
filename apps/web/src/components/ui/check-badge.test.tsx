import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TooltipProvider } from "./tooltip";
import { CheckBadge } from "./check-badge";

describe("CheckBadge", () => {
  it("names the three outcomes", () => {
    render(
      <TooltipProvider>
        <CheckBadge outcome="pass" />
        <CheckBadge outcome="warn" />
        <CheckBadge outcome="fail" />
      </TooltipProvider>,
    );
    for (const name of ["Réussi", "À surveiller", "Échec"]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
  });

  it("rings the selected check", () => {
    render(<CheckBadge outcome="warn" selected />);
    const badge = screen.getByRole("button", { name: "À surveiller" });
    expect(badge).toHaveAttribute("aria-pressed", "true");
    expect(badge.style.boxShadow).toContain("var(--prop-fg)");
  });
});
