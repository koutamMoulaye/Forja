"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, ChatCircleText } from "@phosphor-icons/react";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/cn";

/**
 * The question field: the large one of the home page (S4, 76 px) or the bar under a
 * conversation (C4, 64 px). Enter sends; the copper button sends too.
 */
export function Composer({
  placeholder,
  onSubmit,
  disabled = false,
  busy = false,
  hero = false,
  autoFocus = false,
  initial = "",
  label,
  testId,
}: {
  placeholder: string;
  onSubmit: (text: string) => void;
  disabled?: boolean;
  busy?: boolean;
  hero?: boolean;
  autoFocus?: boolean;
  initial?: string;
  label: string;
  testId?: string;
}) {
  const [text, setText] = useState(initial);
  const input = useRef<HTMLInputElement>(null);
  const ready = text.trim().length >= 2 && !disabled && !busy;

  // A prefilled question (« Poser une question avec cet indicateur ») gets the caret at its
  // end; the parent keys the composer on it, so the text starts from it.
  useEffect(() => {
    if (!initial) return;
    const field = input.current;
    if (field) {
      field.focus();
      field.setSelectionRange(initial.length, initial.length);
    }
  }, [initial]);

  const send = () => {
    if (!ready) return;
    onSubmit(text.trim());
    setText("");
  };

  return (
    <form
      data-testid={testId}
      onSubmit={(event) => {
        event.preventDefault();
        send();
      }}
      className={cn(
        "flex w-full items-center gap-3 bg-node",
        hero
          ? "h-[76px] max-w-[780px] rounded-3xl pr-3 pl-6 shadow-float max-sm:h-16 max-sm:pl-4"
          : "h-16 max-w-[820px] rounded-[32px] pr-2 pl-6 shadow-sm",
        "transition-shadow duration-200 ease-soft focus-within:shadow-[var(--sh-float),0_0_0_2px_var(--acc)]",
      )}
    >
      {hero ? <ChatCircleText size={24} className="flex-none text-tx3" aria-hidden /> : null}
      <input
        ref={input}
        aria-label={label}
        value={text}
        disabled={disabled}
        autoFocus={autoFocus}
        maxLength={1000}
        placeholder={placeholder}
        onChange={(event) => setText(event.target.value)}
        className={cn(
          "min-w-0 flex-1 border-0 bg-transparent font-sans text-tx outline-none placeholder:text-tx3 disabled:cursor-not-allowed",
          hero ? "text-[18px] max-sm:text-[16px]" : "text-[16px]",
        )}
      />
      <button
        type="submit"
        aria-label="Envoyer"
        disabled={!ready}
        className={cn(
          "flex flex-none items-center justify-center rounded-full border-0 transition-[background-color,color,filter] duration-200 ease-soft",
          hero ? "size-[52px]" : "size-12",
          ready
            ? "bg-acc text-on-acc hover:brightness-[1.06]"
            : busy
              ? "bg-run-bg text-run-fg"
              : "bg-sunk text-tx3",
        )}
      >
        {busy ? <Spinner size={16} /> : <ArrowUp size={hero ? 20 : 19} weight="bold" />}
      </button>
    </form>
  );
}
