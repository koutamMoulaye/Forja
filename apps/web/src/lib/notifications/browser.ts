"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * The browser's own notifications, only once the user asked for them (a click in the
 * notifications panel, or « Me prévenir à la fin » on a conversation); the choice is
 * kept per user in local storage.
 */
const listeners = new Set<() => void>();

function key(userId: string) {
  return `forja-browser-notifications:${userId}`;
}

function load(userId: string): boolean {
  try {
    return window.localStorage.getItem(key(userId)) === "on";
  } catch {
    return false;
  }
}

function save(userId: string, on: boolean) {
  try {
    if (on) window.localStorage.setItem(key(userId), "on");
    else window.localStorage.removeItem(key(userId));
  } catch {
    // Storage unavailable: the choice lasts for this page only.
  }
  listeners.forEach((listener) => listener());
}

export type BrowserPermission = NotificationPermission | "unsupported";

function permission(): BrowserPermission {
  return typeof Notification === "undefined" ? "unsupported" : Notification.permission;
}

export function browserNotificationsOn(userId: string): boolean {
  return load(userId) && permission() === "granted";
}

export function useBrowserNotifications(userId: string) {
  const state = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => `${load(userId)}:${permission()}`,
    () => "false:unsupported",
  );
  const [stored, allowed] = state.split(":") as ["true" | "false", BrowserPermission];
  const enable = useCallback(async () => {
    if (typeof Notification === "undefined") return;
    const answer =
      Notification.permission === "default"
        ? await Notification.requestPermission().catch(() => "denied" as const)
        : Notification.permission;
    save(userId, answer === "granted");
  }, [userId]);
  const disable = useCallback(() => save(userId, false), [userId]);
  return { on: stored === "true" && allowed === "granted", permission: allowed, enable, disable };
}
