"use client";

import { Select as SelectPrimitive } from "radix-ui";
import { CaretUpDown, Check } from "@phosphor-icons/react";
import { Children, createContext, isValidElement, useContext, useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { getNonce } from "get-nonce";

type Labels = { value: string | undefined; labels: Map<string, React.ReactNode> };

const LabelsContext = createContext<Labels>({ value: undefined, labels: new Map() });

/** Reads the items' labels from the JSX, so the trigger shows them before the list mounts. */
function collectLabels(node: React.ReactNode, labels: Map<string, React.ReactNode>) {
  Children.forEach(node, (child) => {
    if (!isValidElement<{ value?: string; children?: React.ReactNode }>(child)) return;
    if (child.type === SelectItem && child.props.value !== undefined) {
      labels.set(child.props.value, child.props.children);
    } else {
      collectLabels(child.props.children, labels);
    }
  });
  return labels;
}

export function Select({
  value,
  defaultValue,
  onValueChange,
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Root>) {
  const [inner, setInner] = useState(defaultValue);
  const current = value ?? inner;
  const labels = useMemo(() => collectLabels(children, new Map()), [children]);
  return (
    <LabelsContext.Provider value={{ value: current, labels }}>
      <SelectPrimitive.Root
        value={value}
        defaultValue={defaultValue}
        onValueChange={(next) => {
          setInner(next);
          onValueChange?.(next);
        }}
        {...props}
      >
        {children}
      </SelectPrimitive.Root>
    </LabelsContext.Provider>
  );
}

export const SelectGroup = SelectPrimitive.Group;

/** Shows the selected item's label; children, when given, still take precedence. */
export function SelectValue({
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Value>) {
  const { value, labels } = useContext(LabelsContext);
  const label = value ? labels.get(value) : undefined;
  return <SelectPrimitive.Value {...props}>{children ?? label}</SelectPrimitive.Value>;
}

export function SelectTrigger({
  className,
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Trigger>) {
  return (
    <SelectPrimitive.Trigger
      className={cn(
        "inline-flex h-[34px] min-w-[132px] items-center justify-between gap-2 rounded-md border-0 bg-sunk pr-2.5 pl-3",
        "font-sans text-ui font-medium text-tx transition-colors outline-none hover:bg-hair",
        "disabled:text-tx3 data-[placeholder]:text-tx3",
        className,
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <CaretUpDown size={13} className="text-tx3" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
}

export function SelectContent({
  className,
  children,
  position = "popper",
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Content>) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        position={position}
        sideOffset={6}
        className={cn(
          "z-50 max-h-(--radix-select-content-available-height) min-w-(--radix-select-trigger-width) material-glass-hi",
          "overflow-hidden rounded-[14px] p-1.5 text-tx shadow-float",
          "origin-(--radix-select-content-transform-origin) data-[state=open]:animate-in-pop",
          className,
        )}
        {...props}
      >
        {/* Its scrollbar style is an inline element: it carries the page's CSP nonce. */}
        <SelectPrimitive.Viewport nonce={getNonce()}>{children}</SelectPrimitive.Viewport>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
}

export function SelectItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Item>) {
  return (
    <SelectPrimitive.Item
      className={cn(
        "relative flex h-[38px] cursor-pointer items-center gap-2.5 rounded-sm pr-8 pl-2.5 text-[14px] outline-none select-none",
        "data-[disabled]:pointer-events-none data-[disabled]:text-tx3 data-[highlighted]:bg-sunk",
        className,
      )}
      {...props}
    >
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator className="absolute right-2.5 flex text-acc-tx">
        <Check size={14} weight="bold" />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  );
}

export function SelectLabel({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Label>) {
  return (
    <SelectPrimitive.Label
      className={cn("px-2.5 pt-2 pb-1 text-mono font-semibold text-tx3", className)}
      {...props}
    />
  );
}
