import { cn } from "@/lib/cn";

/**
 * Logotype "Strate" (planche v2, proposition 1): an F in three strata. The middle bar, in
 * copper, is the layer being transformed. Drawn on a 96 grid; colours follow the theme.
 */
export const MONOGRAM = {
  size: 96,
  radius: 24,
  stem: { x: 26, y: 22, width: 13, height: 52 },
  top: { x: 26, y: 22, width: 46, height: 13 },
  middle: { x: 26, y: 44, width: 32, height: 13 },
  barRadius: 3,
} as const;

/** "Forja" in Instrument Sans 600, tracking -0.045 em, outlined; baseline at y = 38.12. */
export const WORDMARK_PATH =
  "M6.76 38.12L0 38.12L0 0.68L25.53 0.68L25.53 6.03L6.76 6.03L6.76 17.73L24.28 17.73L24.28 23.09L6.76 23.09L6.76 38.12ZM40.87 38.64Q36.66 38.64 33.46 36.87Q30.26 35.1 28.5 31.95Q26.73 28.81 26.73 24.75Q26.73 20.7 28.5 17.63Q30.26 14.56 33.46 12.82Q36.66 11.08 40.87 11.08Q45.14 11.08 48.31 12.82Q51.48 14.56 53.25 17.63Q55.02 20.7 55.02 24.75Q55.02 28.81 53.22 31.95Q51.43 35.1 48.26 36.87Q45.08 38.64 40.87 38.64ZM40.87 33.38Q42.95 33.38 44.62 32.32Q46.28 31.25 47.22 29.3Q48.15 27.35 48.15 24.7Q48.15 20.8 46.1 18.56Q44.04 16.33 40.87 16.33Q37.7 16.33 35.62 18.56Q33.54 20.8 33.54 24.7Q33.54 27.35 34.5 29.3Q35.46 31.25 37.1 32.32Q38.74 33.38 40.87 33.38ZM64.06 38.12L57.51 38.12L57.51 11.6L63.91 11.6L63.91 16.48Q64.84 14.2 66.56 12.84Q68.8 11.08 71.92 11.08Q73.01 11.08 73.48 11.28L73.48 17.47Q73.22 17.37 72.75 17.34Q72.28 17.32 71.6 17.32Q67.81 17.32 65.94 18.98Q64.06 20.64 64.06 24.28L64.06 38.12ZM73.37 49.3Q72.44 49.3 71.71 49.17Q70.98 49.04 70.3 48.88L70.3 43.78Q70.72 43.94 71.24 44.02Q71.76 44.1 72.38 44.1Q73.94 44.1 74.7 43.37Q75.45 42.64 75.45 41.18L75.45 11.6L82 11.6L82 41.34Q82 45.08 79.92 47.19Q77.84 49.3 73.37 49.3ZM82.26 7.23L75.14 7.23L75.14 0L82.26 0L82.26 7.23ZM109.72 38.12L103.17 38.12Q102.91 37.08 102.8 35.83Q102.7 35 102.65 33.96Q101.61 35.98 99.79 37.13Q97.4 38.64 93.96 38.64Q89.96 38.64 87.59 36.63Q85.23 34.63 85.23 31.25Q85.23 27.61 87.88 25.48Q90.53 23.35 95.37 22.62L102.44 21.53L102.44 20.23Q102.44 18.15 101.27 17.08Q100.1 16.02 97.71 16.02Q95.37 16.02 93.99 16.87Q92.61 17.73 92.3 19.34L86.01 19.34Q86.42 15.65 89.54 13.36Q92.66 11.08 97.92 11.08Q103.38 11.08 106.18 13.55Q108.99 16.02 108.99 20.8L108.99 32.81Q108.99 34.06 109.17 35.36Q109.36 36.66 109.72 38.12ZM102.44 28.81L102.44 25.69L96.46 26.62Q94.12 26.99 92.95 27.92Q91.78 28.86 91.78 30.52Q91.78 32.03 92.87 32.84Q93.96 33.64 95.89 33.64Q98.7 33.64 100.57 32.24Q102.44 30.84 102.44 28.81Z";
export const WORDMARK_SIZE = { width: 109.72, height: 49.3, capHeight: 38.12 } as const;

type Colors = { tile: string; bars: string; accent: string };

const THEMED: Colors = { tile: "var(--tx)", bars: "var(--inv)", accent: "var(--acc)" };

export function MonogramShapes({ colors = THEMED }: { colors?: Colors }) {
  const { size, radius, stem, top, middle, barRadius } = MONOGRAM;
  return (
    <>
      <rect width={size} height={size} rx={radius} fill={colors.tile} />
      <rect {...stem} rx={barRadius} fill={colors.bars} />
      <rect {...top} rx={barRadius} fill={colors.bars} />
      <rect {...middle} rx={barRadius} fill={colors.accent} />
    </>
  );
}

/** The monogram tile; scales from the 30 px sidebar mark to the app icon. */
export function Monogram({
  size = 30,
  className,
  title,
}: {
  size?: number;
  className?: string;
  title?: string;
}) {
  return (
    <svg
      viewBox="0 0 96 96"
      width={size}
      height={size}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      className={cn("flex-none", className)}
    >
      <MonogramShapes />
    </svg>
  );
}

/** The word "Forja", outlined so it never depends on the font being loaded. */
export function Wordmark({ height = 19, className }: { height?: number; className?: string }) {
  const width = (WORDMARK_SIZE.width / WORDMARK_SIZE.capHeight) * height;
  const fullHeight = (WORDMARK_SIZE.height / WORDMARK_SIZE.capHeight) * height;
  return (
    <svg
      viewBox={`0 0 ${WORDMARK_SIZE.width} ${WORDMARK_SIZE.height}`}
      width={width}
      height={fullHeight}
      aria-hidden
      className={cn("flex-none overflow-visible", className)}
      style={{ marginBottom: -(fullHeight - height) }}
    >
      <path d={WORDMARK_PATH} fill="currentColor" />
    </svg>
  );
}

/**
 * Monogram and wordmark side by side. `size` is the monogram size; the wordmark's cap
 * height is 0.42 of it, the proportion of the login lockup (44 px tile, 30 px type).
 */
export function Logotype({ size = 44, className }: { size?: number; className?: string }) {
  return (
    <span
      role="img"
      aria-label="Forja"
      className={cn("inline-flex items-center text-tx", className)}
      style={{ gap: Math.round(size * 0.27) }}
    >
      <Monogram size={size} />
      <Wordmark height={size * 0.48} />
    </span>
  );
}
