import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Logotype, Monogram } from "./logo";

describe("Strate logotype", () => {
  it("draws the three strata, the middle one in copper", () => {
    const { container } = render(<Monogram size={30} />);
    const rects = container.querySelectorAll("rect");
    expect(rects).toHaveLength(4);
    expect(rects[3]).toHaveAttribute("fill", "var(--acc)");
  });

  it("is announced as Forja", () => {
    render(<Logotype />);
    expect(screen.getByRole("img", { name: "Forja" })).toBeInTheDocument();
  });
});
