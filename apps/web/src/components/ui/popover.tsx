"use client";

import { Popover as PopoverPrimitive } from "radix-ui";
import { cn } from "@/lib/cn";

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverAnchor = PopoverPrimitive.Anchor;
export const PopoverClose = PopoverPrimitive.Close;

export function PopoverContent({
  className,
  align = "end",
  sideOffset = 8,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        align={align}
        sideOffset={sideOffset}
        collisionPadding={14}
        className={cn(
          "z-50 rounded-xl p-2 text-tx shadow-float material-glass-hi outline-none",
          "origin-(--radix-popover-content-transform-origin)",
          "data-[state=closed]:animate-out-pop data-[state=open]:animate-in-pop",
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}
