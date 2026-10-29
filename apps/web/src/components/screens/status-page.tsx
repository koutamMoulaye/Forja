import { Logotype } from "@/components/brand/logo";

/**
 * A page that stands in for a screen: unknown address (404) or unexpected error (500),
 * in the sign-in screens' layout, with the way back.
 */
export function StatusPage({
  code,
  title,
  children,
  actions,
}: {
  code: string;
  title: string;
  children: React.ReactNode;
  actions: React.ReactNode;
}) {
  return (
    <main
      className="flex min-h-dvh flex-col items-center justify-center gap-7 bg-bg px-4 py-10"
      data-testid={`status-${code}`}
    >
      <Logotype size={44} />
      <section
        aria-labelledby="status-title"
        className="flex w-full max-w-[460px] flex-col gap-[18px] rounded-3xl bg-node p-8 shadow-float max-[460px]:p-6"
      >
        <header className="flex flex-col gap-1.5">
          <span className="font-mono text-mono text-tx3">Erreur {code}</span>
          <h1
            id="status-title"
            className="m-0 text-[22px] leading-tight font-semibold tracking-[-0.02em]"
          >
            {title}
          </h1>
          <div className="text-[14.5px] leading-normal text-tx2">{children}</div>
        </header>
        <div className="flex flex-wrap gap-2.5">{actions}</div>
      </section>
    </main>
  );
}
