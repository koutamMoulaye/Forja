import { render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./select";

function RoleSelect({ value }: { value: string }) {
  return (
    <Select value={value}>
      <SelectTrigger aria-label="Rôle">
        <SelectValue placeholder="Choisir" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="engineer">Engineer</SelectItem>
        <SelectItem value="analyst">Analyst</SelectItem>
      </SelectContent>
    </Select>
  );
}

describe("Select", () => {
  it("shows the selected item's label without being given it", () => {
    render(<RoleSelect value="analyst" />);
    expect(screen.getByRole("combobox", { name: "Rôle" })).toHaveTextContent("Analyst");
  });

  it("follows the value when it changes", () => {
    const { rerender } = render(<RoleSelect value="analyst" />);
    rerender(<RoleSelect value="engineer" />);
    expect(screen.getByRole("combobox", { name: "Rôle" })).toHaveTextContent("Engineer");
  });

  it("renders the label on the server, before hydration", () => {
    expect(renderToString(<RoleSelect value="analyst" />)).toContain("Analyst");
  });
});
