"use client";

import { useEffect, useState } from "react";

export type Lockout = { until: number; seconds: number };

/** Builds a lockout from a Retry-After delay; call it from an event handler. */
export function lockoutFor(seconds: number): Lockout {
  return { until: Date.now() + seconds * 1000, seconds };
}

/** Seconds left in a lockout, refreshed four times a second; 0 once it is over. */
export function useCountdown(lockout: Lockout | null): number {
  const [state, setState] = useState({ lockout, remaining: lockout?.seconds ?? 0 });
  // A new lockout restarts from its own delay (derived during render).
  if (state.lockout !== lockout) setState({ lockout, remaining: lockout?.seconds ?? 0 });

  useEffect(() => {
    if (!lockout) return;
    const timer = window.setInterval(() => {
      const remaining = Math.max(0, Math.ceil((lockout.until - Date.now()) / 1000));
      setState((current) => (current.lockout === lockout ? { lockout, remaining } : current));
      if (remaining === 0) window.clearInterval(timer);
    }, 250);
    return () => window.clearInterval(timer);
  }, [lockout]);

  return state.lockout === lockout ? state.remaining : (lockout?.seconds ?? 0);
}

/** A delay written for people: "45 s", "2 min 05 s", "1 h 05 min". */
export function formatDelay(totalSeconds: number): string {
  const seconds = Math.max(0, Math.ceil(totalSeconds));
  if (seconds < 60) return `${seconds} s`;
  if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    const rest = seconds % 60;
    return rest ? `${minutes} min ${String(rest).padStart(2, "0")} s` : `${minutes} min`;
  }
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.ceil((seconds % 3600) / 60);
  if (minutes === 60) return `${hours + 1} h`;
  return minutes ? `${hours} h ${String(minutes).padStart(2, "0")} min` : `${hours} h`;
}
