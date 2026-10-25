"use client";

import { createContext, useContext } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { AnimatePresence, motion } from "motion/react";
import { X } from "@phosphor-icons/react";
import { cn } from "@/lib/cn";
import { springs } from "@/lib/motion";

const SheetOpen = createContext(false);

/**
 * Side panel, the inspector. Non-modal by default: the canvas behind stays usable, as in
 * the mockups. Slides in from the right on a 380/34 spring.
 */
export function Sheet({
  open,
  onOpenChange,
  modal = false,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  modal?: boolean;
  children: React.ReactNode;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange} modal={modal}>
      <SheetOpen value={open}>{children}</SheetOpen>
    </DialogPrimitive.Root>
  );
}

export const SheetTrigger = DialogPrimitive.Trigger;
export const SheetClose = DialogPrimitive.Close;

export function SheetContent({
  className,
  children,
  inline = false,
  ...props
}: Omit<React.ComponentProps<typeof DialogPrimitive.Content>, "forceMount" | "asChild"> & {
  /** Rendered in place (absolute in its parent) instead of portalled to the body. */
  inline?: boolean;
}) {
  const open = useContext(SheetOpen);
  const content = (
    <AnimatePresence>
      {open ? (
        <DialogPrimitive.Content
          forceMount
          asChild
          onInteractOutside={(event) => event.preventDefault()}
          {...props}
        >
          <motion.aside
            initial={{ x: "calc(100% + 24px)", opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: "calc(100% + 24px)", opacity: 0 }}
            transition={{ x: springs.sheet, opacity: { duration: 0.25 } }}
            className={cn(
              "z-30 flex w-[388px] max-w-[calc(100vw-24px)] flex-col overflow-hidden rounded-2xl text-tx shadow-float material-glass-hi outline-none",
              inline ? "absolute top-3 right-3 bottom-3" : "fixed top-[68px] right-3 bottom-3",
              className,
            )}
          >
            {children}
          </motion.aside>
        </DialogPrimitive.Content>
      ) : null}
    </AnimatePresence>
  );
  return inline ? content : <DialogPrimitive.Portal forceMount>{content}</DialogPrimitive.Portal>;
}

export function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div className={cn("flex flex-col gap-3 px-[18px] pt-[18px] pb-3", className)} {...props} />
  );
}

export function SheetBody({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex min-h-0 flex-1 flex-col gap-3 overflow-auto px-[18px] pt-1 pb-[18px]",
        className,
      )}
      {...props}
    />
  );
}

export function SheetTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      className={cn("text-panel leading-[1.3] font-semibold", className)}
      {...props}
    />
  );
}

export function SheetDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return <DialogPrimitive.Description className={cn("text-meta text-tx3", className)} {...props} />;
}

export function SheetCloseButton({ className }: { className?: string }) {
  return (
    <DialogPrimitive.Close
      aria-label="Fermer"
      className={cn(
        "flex size-8 flex-none items-center justify-center rounded-md bg-sunk text-tx2 transition-colors hover:text-tx",
        className,
      )}
    >
      <X size={16} />
    </DialogPrimitive.Close>
  );
}
