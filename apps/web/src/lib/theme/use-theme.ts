"use client";

import { useCallback, useSyncExternalStore } from "react";
import {
  THEME_STORAGE_KEY,
  isThemePreference,
  resolveTheme,
  type ResolvedTheme,
  type ThemePreference,
} from "./theme";

const DARK_QUERY = "(prefers-color-scheme: dark)";
const listeners = new Set<() => void>();

/** The document is the store: the init script wrote the preference before hydration. */
function currentPreference(): ThemePreference {
  const value = document.documentElement.dataset.themePreference;
  return isThemePreference(value) ? value : "system";
}

function currentResolved(): ResolvedTheme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

function apply(preference: ThemePreference): void {
  const root = document.documentElement;
  root.dataset.theme = resolveTheme(preference, window.matchMedia(DARK_QUERY).matches);
  root.dataset.themePreference = preference;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const media = window.matchMedia(DARK_QUERY);
  const onSystemChange = () => {
    if (currentPreference() === "system") apply("system");
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key === THEME_STORAGE_KEY) {
      apply(isThemePreference(event.newValue) ? event.newValue : "system");
    }
  };
  media.addEventListener("change", onSystemChange);
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    media.removeEventListener("change", onSystemChange);
    window.removeEventListener("storage", onStorage);
  };
}

export function setThemePreference(preference: ThemePreference): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Storage unavailable: the choice lasts for this page only.
  }
  apply(preference);
}

export function useTheme(): {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  setPreference: (preference: ThemePreference) => void;
} {
  const preference = useSyncExternalStore(subscribe, currentPreference, () => "system" as const);
  const resolved = useSyncExternalStore(subscribe, currentResolved, () => "light" as const);
  const setPreference = useCallback((next: ThemePreference) => setThemePreference(next), []);
  return { preference, resolved, setPreference };
}
