"use client";

import { useId, useState } from "react";
import { Eye, EyeSlash } from "@phosphor-icons/react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

export const inputVariants = cva(
  [
    "w-full min-w-0 border-0 font-sans text-tx transition-shadow duration-200 ease-soft outline-none",
    "placeholder:text-tx3 disabled:cursor-not-allowed disabled:text-tx3",
    "aria-invalid:shadow-[0_0_0_2px_var(--err-solid)]",
  ],
  {
    variants: {
      variant: {
        /** Sunken field of the sign-in screens. */
        sunk: "bg-sunk focus-visible:shadow-[0_0_0_2px_var(--acc)] focus-visible:outline-none",
        /** Outlined field of the editing panels. */
        outline:
          "bg-node shadow-[inset_0_0_0_1px_var(--edge)] focus-visible:shadow-[inset_0_0_0_1px_var(--edge),0_0_0_2px_var(--acc)] focus-visible:outline-none",
      },
      size: {
        md: "h-[42px] rounded-[11px] px-3 text-body",
        lg: "h-[46px] rounded-lg px-3.5 text-[15px]",
      },
    },
    defaultVariants: { variant: "sunk", size: "md" },
  },
);

export type InputProps = Omit<React.ComponentProps<"input">, "size"> &
  VariantProps<typeof inputVariants>;

export function Input({ className, variant, size, ...props }: InputProps) {
  return <input className={cn(inputVariants({ variant, size }), className)} {...props} />;
}

/** Password field with a visibility toggle (the eye of the S7 and S8 mockups). */
export function PasswordInput({ className, variant, size, ...props }: InputProps) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input
        type={visible ? "text" : "password"}
        variant={variant}
        size={size}
        className={cn("pr-11", className)}
        {...props}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Masquer le mot de passe" : "Afficher le mot de passe"}
        aria-pressed={visible}
        className="absolute top-1/2 right-2 flex size-8 -translate-y-1/2 items-center justify-center rounded-sm text-tx3 transition-colors hover:text-tx"
      >
        {visible ? <EyeSlash size={18} /> : <Eye size={18} />}
      </button>
    </div>
  );
}

type FieldProps = {
  label: React.ReactNode;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  className?: string;
  children: (ids: {
    id: string;
    describedBy: string | undefined;
    invalid: boolean;
  }) => React.ReactNode;
};

/** Label, control, hint and error wired together for assistive technologies. */
export function Field({ label, hint, error, className, children }: FieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-meta font-semibold text-tx2">
        {label}
      </label>
      {children({ id, describedBy, invalid: Boolean(error) })}
      {hint ? (
        <span id={hintId} className="text-meta text-tx3">
          {hint}
        </span>
      ) : null}
      {error ? (
        <span id={errorId} role="alert" className="text-meta font-medium text-err-fg">
          {error}
        </span>
      ) : null}
    </div>
  );
}
