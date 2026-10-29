"use client";

import { useEffect, useState } from "react";

/** ``value`` once it has not changed for ``delay`` ms: a search sent when typing pauses. */
export function useDebounced<T>(value: T, delay: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return settled;
}
