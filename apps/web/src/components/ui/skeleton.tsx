import { cn } from "@/lib/cn";

/** Loading placeholder with the mockups' slow shimmer, sunk to hair. */
export function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      aria-hidden
      className={cn(
        "animate-shimmer rounded-lg bg-[linear-gradient(90deg,var(--sunk)_0%,var(--hair)_50%,var(--sunk)_100%)] bg-[length:840px_100%]",
        className,
      )}
      {...props}
    />
  );
}
