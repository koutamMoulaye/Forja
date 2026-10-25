import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";
import { LoginForm, loginErrorMessage } from "./login-form";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  useSearchParams: () => new URLSearchParams("next=/projects/p1/runs"),
}));

function respond(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function renderForm() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <LoginForm />
    </QueryClientProvider>,
  );
}

async function fillAndSubmit() {
  await userEvent.type(screen.getByLabelText("Adresse e-mail"), "ingenieur@demo.forja.local");
  await userEvent.type(screen.getByLabelText("Mot de passe"), "un-mot-de-passe");
  await userEvent.click(screen.getByRole("button", { name: "Se connecter" }));
}

describe("LoginForm", () => {
  beforeEach(() => {
    replace.mockReset();
    document.cookie = "forja_csrf=token-1";
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("signs in through the web server, with the CSRF header, then follows the redirect", async () => {
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) =>
      url === "/api/health"
        ? respond(200, { status: "ok", version: "0.1.0", auth_mode: "local" })
        : respond(200, { redirect: "/projects/p1/runs", must_change_password: false }),
    );
    vi.stubGlobal("fetch", fetchMock);
    renderForm();
    await fillAndSubmit();
    const [, init] = fetchMock.mock.calls.find(([url]) => url === "/api/auth/login")!;
    expect(new Headers(init?.headers).get("X-CSRF-Token")).toBe("token-1");
    expect(JSON.parse(init?.body as string)).toMatchObject({
      email: "ingenieur@demo.forja.local",
      remember: true,
      next: "/projects/p1/runs",
    });
    expect(replace).toHaveBeenCalledWith("/projects/p1/runs");
  });

  it("says when the credentials are wrong", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url === "/api/health"
          ? respond(200, { status: "ok", version: "0.1.0" })
          : respond(401, { error: { code: "unauthorized", message: "invalid email or password" } }),
      ),
    );
    renderForm();
    await fillAndSubmit();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Adresse e-mail ou mot de passe incorrect.",
    );
  });

  it("locks the form and counts down after a 429", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url === "/api/health"
          ? respond(200, { status: "ok", version: "0.1.0" })
          : respond(
              429,
              { error: { code: "too_many_attempts", message: "too many" } },
              { "Retry-After": "75" },
            ),
      ),
    );
    renderForm();
    await fillAndSubmit();
    expect(await screen.findByText("Connexion verrouillée")).toBeInTheDocument();
    expect(screen.getByTestId("lockout-countdown")).toHaveTextContent("1 min 15 s");
    expect(screen.getByRole("button", { name: "Se connecter" })).toBeDisabled();
    expect(screen.getByLabelText("Mot de passe")).toHaveValue("");
  });

  it("re-enables the form when the lockout ends", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url === "/api/health"
          ? respond(200, { status: "ok", version: "0.1.0" })
          : respond(
              429,
              { error: { code: "too_many_attempts", message: "too many" } },
              { "Retry-After": "2" },
            ),
      ),
    );
    renderForm();
    await fillAndSubmit();
    expect(await screen.findByTestId("lockout-countdown")).toHaveTextContent("2 s");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(screen.queryByText("Connexion verrouillée")).not.toBeInTheDocument();
  });

  it("explains an unreachable API", () => {
    expect(loginErrorMessage(new ApiError(502, "api_unreachable", "down"))).toContain(
      "ne répond pas",
    );
    expect(loginErrorMessage(new ApiError(403, "csrf_failed", "csrf"))).toContain("Rechargez");
  });
});
