import { Slot } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";
import { Spinner } from "./spinner";

export const buttonVariants = cva(
  [
    "relative inline-flex flex-none items-center justify-center gap-2 border-0 font-sans whitespace-nowrap",
    "transition-[background-color,box-shadow,color,filter,transform] duration-200 ease-soft",
    "disabled:pointer-events-none aria-disabled:pointer-events-none",
    "[&_svg]:flex-none",
  ],
  {
    variants: {
      variant: {
        /** Copper, one per view: the action that moves the work forward. */
        primary:
          "bg-acc font-semibold text-on-acc hover:brightness-[1.06] active:brightness-[0.97] disabled:bg-sunk disabled:text-tx3",
        /** Raised white card. */
        secondary:
          "bg-node font-medium text-tx shadow-sm hover:shadow-hover disabled:text-tx3 disabled:shadow-none",
        /** Sunken tone, for the many neutral actions. */
        tonal: "bg-sunk font-medium text-tx hover:bg-hair disabled:text-tx3",
        /** No surface until hovered. */
        quiet: "bg-transparent font-medium text-tx2 hover:bg-sunk hover:text-tx disabled:text-tx3",
        /** Destructive, solid. */
        danger:
          "bg-err-solid font-semibold text-on-err hover:brightness-[1.06] disabled:bg-sunk disabled:text-tx3",
        /** Destructive, as text in lists. */
        "danger-quiet": "bg-transparent font-medium text-err-fg hover:bg-err-bg disabled:text-tx3",
        /** Inline text action in copper. */
        link: "h-auto bg-transparent p-0 font-medium text-acc-tx hover:underline",
      },
      size: {
        sm: "h-[30px] rounded-sm px-2.5 text-meta",
        md: "h-[34px] rounded-md px-3 text-ui",
        lg: "h-10 rounded-[11px] px-4 text-body",
        xl: "h-12 rounded-[13px] px-5 text-[15.5px]",
        icon: "size-9 rounded-md p-0",
        "icon-sm": "size-8 rounded-md p-0",
      },
    },
    compoundVariants: [{ variant: "link", className: "h-auto px-0" }],
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

export type ButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
    loading?: boolean;
  };

export function Button({
  className,
  variant,
  size,
  asChild = false,
  loading = false,
  disabled,
  children,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp
      data-variant={variant ?? "secondary"}
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={asChild ? undefined : disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && !asChild ? (
        <>
          <Spinner size={13} />
          {children}
        </>
      ) : (
        children
      )}
    </Comp>
  );
}
