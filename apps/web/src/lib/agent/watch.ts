"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

/**
 * Conversations whose end the user wants to hear about (« Me prévenir à la fin »), per
 * user, in local storage: the shell announces them wherever the user is.
 */
const listeners = new Set<() => void>();

function storageKey(userId: string) {
  return `forja-agent-watch:${userId}`;
}

function load(userId: string): string {
  try {
    return window.localStorage.getItem(storageKey(userId)) ?? "[]";
  } catch {
    return "[]";
  }
}

function save(userId: string, ids: string[]) {
  try {
    window.localStorage.setItem(storageKey(userId), JSON.stringify(ids.slice(-50)));
  } catch {
    // Storage unavailable: the choice lasts for this page only.
  }
  listeners.forEach((listener) => listener());
}

export function watchedIds(userId: string): Set<string> {
  return new Set(JSON.parse(load(userId)) as string[]);
}

export function setWatched(userId: string, martId: string, on: boolean) {
  const ids = watchedIds(userId);
  if (on) ids.add(martId);
  else ids.delete(martId);
  save(userId, [...ids]);
}

export function useWatched(userId: string) {
  const raw = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => load(userId),
    () => "[]",
  );
  const ids = useMemo(() => new Set(JSON.parse(raw) as string[]), [raw]);
  const toggle = useCallback(
    (martId: string, on: boolean) => setWatched(userId, martId, on),
    [userId],
  );
  return { ids, toggle };
}

/** The browser's own notification, when allowed and the page is not in front. */
export function systemNotify(title: string, body: string, onClick?: () => void) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  if (document.visibilityState === "visible" && document.hasFocus()) return;
  try {
    const notice = new Notification(title, { body, tag: `forja:${title}` });
    notice.onclick = () => {
      window.focus();
      onClick?.();
      notice.close();
    };
  } catch {
    // Some browsers only notify from a service worker: the toast remains.
  }
}

/** Asks once for the browser's permission, from a click (never on page load). */
export function askNotificationPermission() {
  if (typeof Notification === "undefined" || Notification.permission !== "default") return;
  void Notification.requestPermission().catch(() => undefined);
}
