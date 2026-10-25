import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Segmented } from "./tabs";

describe("Segmented", () => {
  it("marks the current value and reports changes", async () => {
    const onChange = vi.fn();
    render(
      <Segmented
        label="Apparence"
        value="light"
        onValueChange={onChange}
        options={[
          { value: "light", label: "Clair" },
          { value: "dark", label: "Sombre" },
          { value: "system", label: "Système" },
        ]}
      />,
    );
    expect(screen.getByRole("button", { name: "Clair" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(screen.getByRole("button", { name: "Sombre" }));
    expect(onChange).toHaveBeenCalledWith("dark");
  });
});
