"use client";

import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { LockSimple, WarningCircle, type Icon } from "@phosphor-icons/react";
import { transitionLayoutId } from "@/components/shell/shared-transition";
import { useShell } from "@/components/shell/shell-context";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api/errors";
import { cn } from "@/lib/cn";
import { springs } from "@/lib/motion";

/**
 * Body of a detailed screen (v2 V6, V7, S3, S6): the content column, and an optional
 * panel on the right, 12 px from the edges, as in ForjaApp.
 */
export function ScreenBody({
  children,
  aside,
  asideWidth = 400,
  className,
  testId,
}: {
  children: React.ReactNode;
  aside?: React.ReactNode;
  asideWidth?: number;
  className?: string;
  testId?: string;
}) {
  return (
    <div data-testid={testId} className="flex min-h-full w-full max-lg:flex-col lg:h-full">
      <div
        className={cn(
          "flex min-w-0 flex-1 flex-col gap-4 px-7 pt-2.5 pb-7 lg:overflow-auto",
          className,
        )}
      >
        {children}
      </div>
      {aside ? (
        <aside
          className="m-3 flex flex-none flex-col overflow-hidden rounded-2xl bg-node shadow-sm lg:mt-2.5 lg:ml-0"
          style={{ width: `min(${asideWidth}px, calc(100% - 24px))` }}
        >
          {aside}
        </aside>
      ) : null}
    </div>
  );
}

/**
 * The shared element of a detailed screen: a node double-clicked on the canvas grows
 * into it (same layoutId as the node card drawn by SharedTransitionLayer).
 */
export function useSharedLayoutId(): string | undefined {
  const { transition } = useShell();
  const pathname = usePathname();
  return transition && transition.href === pathname ? transitionLayoutId(transition.id) : undefined;
}

/** Title, subtitle and actions of a screen. The title block is the shared element. */
export function ScreenHeader({
  title,
  subtitle,
  actions,
  eyebrow,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  eyebrow?: React.ReactNode;
}) {
  const layoutId = useSharedLayoutId();
  return (
    <div className="flex flex-wrap items-end gap-4">
      <motion.div
        layoutId={layoutId}
        transition={{ layout: springs.sheet }}
        data-testid="screen-header"
        className="flex min-w-0 flex-col gap-1 rounded-lg"
      >
        {eyebrow ? <div className="text-meta text-tx3">{eyebrow}</div> : null}
        <h1 className="m-0 text-title font-semibold">{title}</h1>
        {subtitle ? <div className="text-body text-tx2">{subtitle}</div> : null}
      </motion.div>
      {actions ? (
        <div className="ml-auto flex flex-wrap items-center gap-2.5">{actions}</div>
      ) : null}
    </div>
  );
}

/** White card of the mockups: radius 20, small shadow. */
export function Card({ className, children, ...props }: React.ComponentProps<"section">) {
  return (
    <section className={cn("rounded-2xl bg-node shadow-sm", className)} {...props}>
      {children}
    </section>
  );
}

/** « Membres 4 », « À résoudre 2 »: a section title and its counter. */
export function SectionTitle({
  children,
  count,
  action,
  className,
}: {
  children: React.ReactNode;
  count?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <h2 className="m-0 text-section font-semibold">{children}</h2>
      {count !== undefined && count !== null ? (
        <span className="text-[14px] text-tx3 tabular-nums">{count}</span>
      ) : null}
      {action ? <div className="ml-auto flex items-center gap-2">{action}</div> : null}
    </div>
  );
}

/** Column headers of a list card (12.5 px, semibold, tertiary). */
export function ListHead({
  columns,
  className,
  style,
}: {
  columns: React.ReactNode[];
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      role="row"
      className={cn("grid gap-3 px-5 pt-3 pb-2.5 text-[12.5px] font-semibold text-tx3", className)}
      style={style}
    >
      {columns.map((column, index) => (
        <span role="columnheader" key={index}>
          {column}
        </span>
      ))}
    </div>
  );
}

/** A small figure in a sunken tile: « Lignes lues 6 210 ». */
export function Figure({
  label,
  value,
  tone,
  className,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  tone?: "prop" | "err";
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-0.5 rounded-[14px] bg-sunk px-3.5 py-3", className)}>
      <span className="text-meta text-tx3">{label}</span>
      <span
        className={cn(
          "text-[24px] leading-tight font-semibold tracking-[-0.02em] tabular-nums",
          tone === "prop" ? "text-prop-fg" : tone === "err" ? "text-err-fg" : "text-tx",
        )}
      >
        {value}
      </span>
    </div>
  );
}

/** Mono chip of a column or table name. */
export function Code({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-block rounded-xs bg-sunk px-[7px] py-0.5 font-mono text-mono text-tx2",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** A clean empty state: icon tile, title, one sentence, an action. */
export function EmptyState({
  icon: EmptyIcon,
  title,
  description,
  action,
  className,
}: {
  icon: Icon;
  title: string;
  description: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      data-testid="empty-state"
      className={cn(
        "flex flex-col items-center gap-4 rounded-2xl bg-node px-8 py-12 text-center shadow-sm",
        className,
      )}
    >
      <span className="flex size-14 items-center justify-center rounded-2xl bg-acc-soft text-acc-tx">
        <EmptyIcon size={30} weight="duotone" />
      </span>
      <div className="flex max-w-[460px] flex-col gap-1">
        <h2 className="m-0 text-[20px] font-semibold tracking-[-0.02em]">{title}</h2>
        <p className="m-0 text-[14.5px] leading-normal text-tx2">{description}</p>
      </div>
      {action}
    </div>
  );
}

/** What went wrong, in French; a refused permission reads as such, not as a failure. */
export function ScreenError({
  error,
  title = "Impossible de charger cet écran",
  onRetry,
}: {
  error: unknown;
  title?: string;
  onRetry?: () => void;
}) {
  const forbidden = error instanceof ApiError && error.status === 403;
  if (forbidden) {
    return (
      <EmptyState
        icon={LockSimple}
        title="Accès réservé"
        description="Votre rôle dans ce projet ne permet pas d’ouvrir cette partie. Un administrateur du projet peut vous en donner l’accès."
      />
    );
  }
  return (
    <div
      role="alert"
      data-testid="screen-error"
      className="flex flex-col items-start gap-3 rounded-2xl bg-err-bg px-5 py-4"
    >
      <div className="flex items-center gap-2 text-[14.5px] font-semibold text-err-fg">
        <WarningCircle size={19} weight="fill" />
        {title}
      </div>
      <p className="m-0 text-ui text-tx2">
        {error instanceof ApiError && error.status !== 0
          ? error.message
          : "L’API Forja ne répond pas. Vérifiez qu’elle est démarrée, puis réessayez."}
      </p>
      {onRetry ? (
        <Button variant="secondary" size="md" onClick={onRetry}>
          Réessayer
        </Button>
      ) : null}
    </div>
  );
}

/** Skeleton rows of a list card. */
export function ListSkeleton({ rows = 6, height = 60 }: { rows?: number; height?: number }) {
  return (
    <Card className="flex flex-col gap-2 p-4" aria-busy="true" aria-label="Chargement">
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className="w-full rounded-lg" style={{ height: height - 12 }} />
      ))}
    </Card>
  );
}

/** Skeleton of a whole screen: header, then cards. */
export function ScreenSkeleton({ aside = false }: { aside?: boolean }) {
  return (
    <ScreenBody
      aside={
        aside ? (
          <div className="flex flex-col gap-3 p-5" aria-hidden>
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-24 w-full rounded-xl" />
            <Skeleton className="h-24 w-full rounded-xl" />
          </div>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-2" aria-busy="true" aria-label="Chargement">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-5 w-96 max-w-full" />
      </div>
      <ListSkeleton />
    </ScreenBody>
  );
}
