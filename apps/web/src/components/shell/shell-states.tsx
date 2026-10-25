"use client";

import Link from "next/link";
import { Monogram } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

/** Placeholder chrome while the session and the projects load. */
export function ShellLoading() {
  return (
    <div
      className="relative flex h-dvh overflow-hidden bg-bg"
      aria-busy="true"
      aria-label="Chargement"
    >
      <div className="flex w-16 flex-none flex-col items-center gap-3 py-3 shadow-[0.5px_0_0_var(--hair)] material-side">
        <Monogram size={30} />
        <div className="mt-3 flex flex-col gap-2">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="size-10 rounded-[11px]" />
          ))}
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-4 px-7 py-3">
        <div className="flex h-8 items-center gap-3">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="ml-auto h-9 w-60 rounded-md" />
          <Skeleton className="size-[34px] rounded-full" />
        </div>
        <Skeleton className="mt-6 h-9 w-72" />
        <Skeleton className="h-5 w-96" />
        <Skeleton className="mt-2 h-64 w-full rounded-2xl" />
      </div>
    </div>
  );
}

/** Full-page message (project missing, API unreachable). */
export function ShellMessage({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: { label: string; href?: string; onClick?: () => void };
}) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-5 bg-bg px-4 text-center">
      <Monogram size={44} />
      <div className="flex max-w-md flex-col gap-1.5">
        <h1 className="text-[22px] font-semibold tracking-[-0.02em]">{title}</h1>
        <p className="text-[15px] text-tx2">{description}</p>
      </div>
      {action ? (
        action.href ? (
          <Button asChild variant="secondary" size="lg">
            <Link href={action.href} className="no-underline hover:no-underline">
              {action.label}
            </Link>
          </Button>
        ) : (
          <Button variant="secondary" size="lg" onClick={action.onClick}>
            {action.label}
          </Button>
        )
      ) : null}
    </main>
  );
}
