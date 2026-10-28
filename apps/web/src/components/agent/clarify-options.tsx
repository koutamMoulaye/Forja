"use client";

import { formatOptionCount, type MartIteration } from "@/lib/agent/view";
import { cn } from "@/lib/cn";

/**
 * The agent's question back (C4): each option a large card with what it covers
 * (« 1 284 clients »); a free answer goes through the field under the conversation.
 */
export function ClarifyOptions({
  iteration,
  onPick,
  disabled = false,
  picked = null,
}: {
  iteration: MartIteration;
  onPick: (option: number) => void;
  disabled?: boolean;
  picked?: number | null;
}) {
  const clarification = iteration.clarification;
  if (!clarification) return null;
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-3" data-testid="clarification">
      <p className="m-0 text-[16.5px] leading-normal">
        <span className="font-semibold">Une précision avant de continuer :</span>{" "}
        {clarification.question}
      </p>
      <div role="radiogroup" aria-label={clarification.question} className="flex flex-col gap-2.5">
        {clarification.options.map((option, index) => {
          const count = formatOptionCount(iteration.option_counts?.[index]);
          const chosen = picked === index;
          return (
            <button
              key={option.ref}
              type="button"
              role="radio"
              aria-checked={chosen}
              disabled={disabled}
              onClick={() => onPick(index)}
              data-testid="clarify-option"
              className={cn(
                "flex min-h-[76px] items-center gap-4 rounded-2xl border-0 bg-node px-[18px] py-3.5 text-left font-sans text-tx shadow-sm",
                "transition-[transform,box-shadow] duration-200 ease-soft hover:-translate-y-px hover:shadow-hover",
                "disabled:pointer-events-none disabled:opacity-60",
                chosen && "shadow-[inset_0_0_0_1.5px_var(--acc)]",
              )}
            >
              <span
                className={cn(
                  "size-[22px] flex-none rounded-full",
                  chosen
                    ? "bg-node shadow-[inset_0_0_0_6px_var(--acc)]"
                    : "shadow-[inset_0_0_0_1.5px_var(--edge)]",
                )}
              />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-[16px] font-semibold">{option.label}</span>
                <span className="text-[14px] text-tx3">{describeRef(option.ref)}</span>
              </span>
              {count ? (
                <span className="text-[14.5px] whitespace-nowrap text-tx2 tabular-nums">
                  {count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      <p className="m-0 text-[13.5px] text-tx3">
        Forja retiendra votre choix pour cette demande. Aucune ne convient ? Précisez dans le champ
        ci-dessous.
      </p>
    </div>
  );
}

/** What an option is, in a few words: « Une mesure », « Valeur de segment ». */
export function describeRef(ref: string): string {
  const [kind, name = ""] = ref.split(/:(.*)/s);
  switch (kind) {
    case "metric":
      return "Une mesure";
    case "attribute":
      return "Un axe d’analyse";
    case "dimension":
    case "time":
      return "Un axe d’analyse";
    case "value": {
      const [field = "", value = ""] = name.split("=");
      const attribute = field.split(".")[1] ?? field;
      return `Valeur « ${value} » de ${attribute.replace(/_/g, " ")}`;
    }
    case "ignore":
      return "Le mot est laissé de côté";
    default:
      return "";
  }
}
