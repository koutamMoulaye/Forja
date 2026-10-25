import { cn } from "@/lib/cn";

export function Kbd({ className, ...props }: React.ComponentProps<"kbd">) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 items-center rounded-xs bg-sunk px-1.5 font-sans text-[12px] text-tx3",
        className,
      )}
      {...props}
    />
  );
}
