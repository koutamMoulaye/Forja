"use client";

import { Checkbox as CheckboxPrimitive } from "radix-ui";
import { Check, Minus } from "@phosphor-icons/react";
import { cn } from "@/lib/cn";

export function Checkbox({
  className,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      className={cn(
        "peer inline-flex size-[18px] flex-none items-center justify-center rounded-[5px] bg-node text-on-acc",
        "shadow-[inset_0_0_0_1.5px_var(--edge)] transition-[background-color,box-shadow] duration-150 ease-soft",
        "data-[state=checked]:bg-acc data-[state=checked]:shadow-none",
        "data-[state=indeterminate]:bg-acc data-[state=indeterminate]:shadow-none",
        "disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator className="flex items-center justify-center">
        {props.checked === "indeterminate" ? (
          <Minus size={11} weight="bold" />
        ) : (
          <Check size={11} weight="bold" />
        )}
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}
