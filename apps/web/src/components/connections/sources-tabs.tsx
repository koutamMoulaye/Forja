import Link from "next/link";
import { cn } from "@/lib/cn";

/** « Sources · Connexions »: the two lists of the Sources section. */
export function SourcesTabs({
  projectId,
  current,
}: {
  projectId: string;
  current: "sources" | "connections";
}) {
  const tabs = [
    { id: "sources", label: "Sources", href: `/projects/${projectId}/sources` },
    { id: "connections", label: "Connexions", href: `/projects/${projectId}/sources/connections` },
  ] as const;
  return (
    <nav aria-label="Listes des sources" className="flex gap-3">
      {tabs.map((tab) => (
        <Link
          key={tab.id}
          href={tab.href}
          aria-current={tab.id === current ? "page" : undefined}
          className={cn(
            "text-meta no-underline transition-colors hover:text-tx hover:no-underline",
            tab.id === current ? "font-semibold text-tx" : "text-tx3",
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
