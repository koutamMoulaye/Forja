import type { Transition } from "motion/react";

/** Motion tokens shared with globals.css (--ease-soft, --dur-*). */
export const easeSoft = [0.32, 0.72, 0, 1] as const;

export const durations = {
  fast: 0.12,
  base: 0.2,
  step: 0.3,
  layout: 0.32,
  sheet: 0.38,
  canvas: 0.44,
} as const;

export const springs = {
  /** Inspector sliding in from the right: stiffness 380, damping 34. */
  sheet: { type: "spring", stiffness: 380, damping: 34 },
  /** Popovers and menus. */
  pop: { type: "spring", stiffness: 520, damping: 38, mass: 0.8 },
  /** Small elements settling (segmented controls, badges). */
  settle: { type: "spring", stiffness: 420, damping: 36 },
} as const satisfies Record<string, Transition>;

export const fade: Transition = { duration: durations.base, ease: easeSoft };

/** Toasts stay 2.6 s, up to 3.5 s when they carry an action. */
export const toastDurations = { short: 2600, long: 3500 } as const;
