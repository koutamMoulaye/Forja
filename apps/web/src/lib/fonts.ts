import localFont from "next/font/local";

/** Instrument Sans for the interface, variable weight 400 to 700 (OFL). */
export const instrumentSans = localFont({
  src: "../fonts/InstrumentSans-Variable.woff2",
  variable: "--font-instrument",
  weight: "400 700",
  display: "swap",
  fallback: ["system-ui", "sans-serif"],
});

/** Commit Mono for SQL and identifiers (OFL). */
export const commitMono = localFont({
  src: [
    { path: "../fonts/CommitMono-400.woff2", weight: "400", style: "normal" },
    { path: "../fonts/CommitMono-500.woff2", weight: "500", style: "normal" },
  ],
  variable: "--font-commit",
  display: "swap",
  fallback: ["ui-monospace", "monospace"],
});
