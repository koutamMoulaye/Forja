"use client";

import { Tabs as TabsPrimitive } from "radix-ui";
import { cn } from "@/lib/cn";

export const Tabs = TabsPrimitive.Root;

/** Segmented control: sunken track, the active tab rises as a white card. */
export function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={cn("inline-flex items-center gap-0.5 rounded-[11px] bg-sunk p-[3px]", className)}
      {...props}
    />
  );
}

export const segmentClass = cn(
  "inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-sm border-0 bg-transparent px-3.5 whitespace-nowrap",
  "font-sans text-meta font-medium text-tx2 transition-[background-color,box-shadow,color] duration-200 ease-soft outline-none",
  "hover:text-tx focus-visible:outline-2 focus-visible:outline-acc",
  "data-[state=active]:bg-node data-[state=active]:text-tx data-[state=active]:shadow-sm",
  "aria-pressed:bg-node aria-pressed:text-tx aria-pressed:shadow-sm",
  "disabled:text-tx3",
);

export function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return <TabsPrimitive.Trigger className={cn(segmentClass, className)} {...props} />;
}

export function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content className={cn("outline-none", className)} {...props} />;
}

type SegmentedOption<T extends string> = {
  value: T;
  label: React.ReactNode;
  icon?: React.ReactNode;
};

/** Segmented control for a value that is not a set of panels (theme, view, filters). */
export function Segmented<T extends string>({
  value,
  onValueChange,
  options,
  label,
  className,
  size = "md",
}: {
  value: T;
  onValueChange: (value: T) => void;
  options: readonly SegmentedOption<T>[];
  label: string;
  className?: string;
  size?: "sm" | "md";
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn("flex gap-0.5 rounded-[11px] bg-sunk p-[3px]", className)}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={option.value === value}
          onClick={() => onValueChange(option.value)}
          className={cn(segmentClass, size === "md" ? "h-[34px] text-ui" : "h-8 min-w-0 px-2")}
        >
          {option.icon}
          {option.label}
        </button>
      ))}
    </div>
  );
}
