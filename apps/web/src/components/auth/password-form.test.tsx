import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";
import { PasswordForm, passwordChecks, passwordErrorMessage } from "./password-form";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
}));

describe("password requirements", () => {
  it("follow the four rules of the mockup", () => {
    const checks = passwordChecks("initial", "Nouveau-mot-2026", "Nouveau-mot-2026");
    expect(checks.map((c) => c.ok)).toEqual([true, true, true, true]);
    expect(passwordChecks("x", "court1A", "").map((c) => c.ok)).toEqual([false, true, true, false]);
    expect(passwordChecks("same-Password1", "same-Password1", "same-Password1")[2]!.ok).toBe(false);
    expect(passwordChecks("x", "toutenminuscule", "toutenminuscule")[1]!.ok).toBe(false);
  });

  it("explain the API's refusals", () => {
    expect(passwordErrorMessage(new ApiError(401, "unauthorized", "x"))).toBe(
      "Le mot de passe initial est incorrect.",
    );
    expect(
      passwordErrorMessage(
        new ApiError(
          422,
          "invalid_plan",
          "mot de passe trop faible : au moins 5 caractères différents",
        ),
      ),
    ).toBe("Mot de passe trop faible : au moins 5 caractères différents.");
  });
});

describe("PasswordForm", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("enables saving only once every requirement is met", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ status: "ok", version: "0.1.0" })),
    );
    render(
      <QueryClientProvider client={new QueryClient()}>
        <PasswordForm />
      </QueryClientProvider>,
    );
    const save = screen.getByRole("button", { name: "Enregistrer et continuer" });
    expect(save).toBeDisabled();
    await userEvent.type(screen.getByLabelText("Mot de passe initial"), "Forja-initial-2026");
    await userEvent.type(
      screen.getByLabelText("Nouveau mot de passe", { selector: "input" }),
      "Nouveau-mot-2026",
    );
    expect(screen.getByRole("meter")).toHaveAttribute("aria-valuenow", "3");
    expect(save).toBeDisabled();
    await userEvent.type(screen.getByLabelText("Confirmation"), "Nouveau-mot-2026");
    expect(screen.getByRole("meter")).toHaveAttribute("aria-valuenow", "4");
    expect(save).toBeEnabled();
  });
});
