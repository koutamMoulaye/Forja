import { afterEach, describe, expect, it, vi } from "vitest";
import { THEME_STORAGE_KEY, resolveTheme, themeInitScript } from "./theme";

function runInitScript() {
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  new Function(themeInitScript)();
}

function mockSystemDark(dark: boolean) {
  vi.spyOn(window, "matchMedia").mockImplementation(
    (query: string) => ({ matches: dark, media: query }) as MediaQueryList,
  );
}

describe("theme", () => {
  afterEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.theme;
    delete document.documentElement.dataset.themePreference;
    vi.restoreAllMocks();
  });

  it("resolves the system preference", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
    expect(resolveTheme("light", true)).toBe("light");
  });

  it("applies the stored choice before the first paint", () => {
    mockSystemDark(false);
    localStorage.setItem(THEME_STORAGE_KEY, "dark");
    runInitScript();
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.dataset.themePreference).toBe("dark");
  });

  it("follows the system when nothing valid is stored", () => {
    mockSystemDark(true);
    localStorage.setItem(THEME_STORAGE_KEY, "sepia");
    runInitScript();
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.dataset.themePreference).toBe("system");
  });
});
