"use client";

import { Tooltip as TooltipPrimitive } from "radix-ui";
import { cn } from "@/lib/cn";

export const TooltipProvider = TooltipPrimitive.Provider;

export function Tooltip({
  content,
  children,
  side = "bottom",
  className,
  ...props
}: Omit<React.ComponentProps<typeof TooltipPrimitive.Root>, "children"> & {
  content: React.ReactNode;
  children: React.ReactNode;
  side?: React.ComponentProps<typeof TooltipPrimitive.Content>["side"];
  className?: string;
}) {
  return (
    <TooltipPrimitive.Root {...props}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={6}
          collisionPadding={10}
          className={cn(
            "z-50 max-w-[280px] rounded-md bg-tx px-2 py-[5px] text-[12.5px] leading-snug font-medium text-inv shadow-float",
            "origin-(--radix-tooltip-content-transform-origin) data-[state=closed]:animate-out-fade data-[state=delayed-open]:animate-in-pop",
            className,
          )}
        >
          {content}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
