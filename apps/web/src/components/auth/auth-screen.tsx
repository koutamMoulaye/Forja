"use client";

import { useQuery } from "@tanstack/react-query";
import { Logotype } from "@/components/brand/logo";

export type Health = { status: string; version: string; auth_mode?: string };

export function useHealth() {
  return useQuery({
    queryKey: ["health"],
    queryFn: async (): Promise<Health | null> => {
      const response = await fetch("/api/health", { cache: "no-store" });
      return response.ok ? ((await response.json()) as Health) : null;
    },
    staleTime: 60_000,
    retry: false,
  });
}

export function modeLabel(mode: string | undefined): string {
  return mode === "multi" ? "instance partagée" : "poste local";
}

/** Shared frame of the sign-in screens (S7, S8): logotype, card, version line. */
export function AuthScreen({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const health = useHealth();
  const version = health.data?.version;
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-7 bg-bg px-4 py-10">
      <Logotype size={44} />
      <section
        aria-labelledby="auth-title"
        className="flex w-full max-w-[420px] animate-in-dialog flex-col gap-[18px] rounded-3xl bg-node p-8 shadow-float max-[460px]:p-6"
      >
        <header className="flex flex-col gap-1">
          <h1
            id="auth-title"
            className="text-[22px] leading-tight font-semibold tracking-[-0.02em]"
          >
            {title}
          </h1>
          <p className="text-[14px] leading-normal text-tx2">{subtitle}</p>
        </header>
        {children}
      </section>
      <footer className="flex items-center gap-3 text-[12.5px] text-tx3">
        <span>
          {version ? `Forja ${version}` : "Forja"} · {modeLabel(health.data?.auth_mode)} · licence
          Apache 2.0
        </span>
        {footer}
      </footer>
    </main>
  );
}

/** Error panel of the sign-in screens, in the runs' error style. */
export function AuthAlert({
  title,
  children,
  icon,
}: {
  title: React.ReactNode;
  children?: React.ReactNode;
  icon: React.ReactNode;
}) {
  return (
    <div role="alert" className="flex flex-col gap-1 rounded-[14px] bg-err-bg px-3.5 py-3">
      <div className="flex items-center gap-2 text-[14px] font-semibold text-err-fg">
        {icon}
        {title}
      </div>
      {children ? <div className="text-ui leading-normal text-tx2">{children}</div> : null}
    </div>
  );
}
