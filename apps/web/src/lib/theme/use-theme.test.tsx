import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { THEME_STORAGE_KEY } from "./theme";
import { useTheme } from "./use-theme";

describe("useTheme", () => {
  afterEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.theme;
    delete document.documentElement.dataset.themePreference;
  });

  it("persists the choice and applies it to the document", () => {
    const { result } = renderHook(() => useTheme());
    act(() => result.current.setPreference("dark"));
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(result.current.preference).toBe("dark");
    expect(result.current.resolved).toBe("dark");

    act(() => result.current.setPreference("light"));
    expect(result.current.resolved).toBe("light");
  });
});
