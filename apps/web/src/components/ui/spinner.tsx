import { cn } from "@/lib/cn";

/** The mockups' running indicator: a ring with one transparent quarter. */
export function Spinner({ size = 11, className }: { size?: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block flex-none animate-spin-fast rounded-full border-[1.5px] border-current border-r-transparent",
        className,
      )}
      style={{ width: size, height: size }}
    />
  );
}

/** Hatched square marking pseudonymised data. */
export function HatchGlyph({ size = 12, className }: { size?: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block flex-none rounded-[3px] border border-current hatch", className)}
      style={{ width: size, height: size }}
    />
  );
}
