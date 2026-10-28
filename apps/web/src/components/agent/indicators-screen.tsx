"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowRight,
  BookOpenText,
  CalendarBlank,
  MagnifyingGlass,
  SquaresFour,
  TreeStructure,
} from "@phosphor-icons/react";
import {
  Card,
  EmptyState,
  ScreenBody,
  ScreenError,
  ScreenHeader,
  ScreenSkeleton,
} from "@/components/screens/screen";
import { useShell } from "@/components/shell/shell-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError } from "@/lib/api/errors";
import { catalog, questionWith, searchCatalog, type CatalogMetric } from "@/lib/agent/catalog";
import { cn } from "@/lib/cn";
import { plural } from "@/lib/format";
import { useSemanticLayer } from "@/lib/project/queries";

function Synonyms({ words }: { words: string[] }) {
  if (!words.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {words.map((word) => (
        <span key={word} className="rounded-full bg-sunk px-2.5 py-0.5 text-[12.5px] text-tx2">
          {word}
        </span>
      ))}
    </div>
  );
}

function MetricCard({
  metric,
  selected,
  href,
}: {
  metric: CatalogMetric;
  selected: boolean;
  href: string;
}) {
  return (
    <Card
      data-testid="indicator"
      id={`indicateur-${metric.name}`}
      className={cn(
        "flex flex-col gap-2.5 px-5 py-[18px]",
        selected && "shadow-[var(--sh-sm),0_0_0_2px_var(--acc)]",
      )}
    >
      <div className="flex flex-col gap-0.5">
        <h3 className="m-0 text-[16px] font-semibold">{metric.label}</h3>
        <span className="text-[12.5px] text-tx3">
          {metric.format}
          {metric.additive ? " · se cumule sur tous les axes" : " · recalculé à chaque niveau"}
        </span>
      </div>
      <p className="m-0 text-[14px] leading-normal text-tx2">{metric.description}</p>
      {metric.synonyms.length ? (
        <div className="flex flex-col gap-1">
          <span className="text-[12.5px] font-semibold text-tx3">Aussi appelé</span>
          <Synonyms words={metric.synonyms.slice(0, 8)} />
        </div>
      ) : null}
      <Button asChild variant="tonal" size="md" className="mt-auto self-start">
        <Link href={href}>
          Poser une question avec cet indicateur
          <ArrowRight size={15} />
        </Link>
      </Button>
    </Card>
  );
}

/**
 * /projects/[id]/indicators: the business catalogue of what can be asked: metrics with
 * their definition and synonyms, analysis axes, hierarchies; a search over all of it.
 */
export function IndicatorsScreen() {
  const shell = useShell();
  const params = useSearchParams();
  const selected = params.get("indicateur");
  const layer = useSemanticLayer(shell.project.id);
  const [query, setQuery] = useState("");
  const entries = useMemo(() => (layer.data ? catalog(layer.data) : null), [layer.data]);
  const found = entries ? searchCatalog(entries, query) : null;
  const ask = (question: string) =>
    `/projects/${shell.project.id}/ask?q=${encodeURIComponent(question)}`;

  if (layer.isPending) return <ScreenSkeleton />;
  if (layer.isError) {
    return (
      <ScreenBody>
        {layer.error instanceof ApiError && layer.error.status === 404 ? (
          <EmptyState
            icon={BookOpenText}
            title="Pas encore d’indicateurs"
            description="Ils apparaissent dès que l’équipe data a construit le modèle de vos données."
          />
        ) : (
          <ScreenError error={layer.error} onRetry={() => void layer.refetch()} />
        )}
      </ScreenBody>
    );
  }
  const firstMetric = entries?.metrics[0];

  return (
    <ScreenBody testId="indicators-screen">
      <ScreenHeader
        title="Indicateurs"
        subtitle={
          entries
            ? `${plural(entries.metrics.length, "indicateur", "indicateurs")} · ${plural(
                entries.dimensions.reduce((n, d) => n + d.axes.length, 0),
                "axe d’analyse",
                "axes d’analyse",
              )} · version ${layer.data?.version ?? 1}`
            : "Ce que vous pouvez demander"
        }
        actions={
          <div className="relative w-[320px] max-w-full">
            <MagnifyingGlass
              size={17}
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-tx3"
            />
            <Input
              type="search"
              aria-label="Rechercher un indicateur"
              placeholder="Rechercher : chiffre, ville, panier…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="pl-9"
            />
          </div>
        }
      />
      {found && found.metrics.length === 0 && found.dimensions.length === 0 ? (
        <EmptyState
          icon={MagnifyingGlass}
          title={`Rien pour « ${query.trim()} »`}
          description="Essayez un autre mot, ou posez directement votre question : Forja proposera les indicateurs proches."
          action={
            <Button asChild variant="primary" size="lg">
              <Link href={ask(query.trim())}>Poser la question</Link>
            </Button>
          }
        />
      ) : null}
      {found?.metrics.length ? (
        <section className="flex flex-col gap-3" aria-label="Indicateurs">
          <h2 className="m-0 flex items-center gap-2 text-section font-semibold">
            <SquaresFour size={19} className="text-tx3" />
            Indicateurs
          </h2>
          <div className="grid grid-cols-3 gap-4 max-xl:grid-cols-2 max-md:grid-cols-1">
            {found.metrics.map((metric) => (
              <MetricCard
                key={metric.name}
                metric={metric}
                selected={metric.name === selected}
                href={ask(questionWith(metric))}
              />
            ))}
          </div>
        </section>
      ) : null}
      {found?.dimensions.length ? (
        <section className="flex flex-col gap-3" aria-label="Axes d’analyse">
          <h2 className="m-0 flex items-center gap-2 text-section font-semibold">
            <TreeStructure size={19} className="text-tx3" />
            Axes d’analyse
          </h2>
          <div className="grid grid-cols-2 gap-4 max-lg:grid-cols-1">
            {found.dimensions.map((dimension) => (
              <Card
                key={dimension.name}
                className="flex flex-col gap-3 px-5 py-[18px]"
                data-testid="dimension"
              >
                <div className="flex items-center gap-2">
                  {dimension.time ? <CalendarBlank size={18} className="text-tx3" /> : null}
                  <h3 className="m-0 text-[16px] font-semibold">{dimension.label}</h3>
                  <span className="text-[13px] text-tx3">
                    {plural(dimension.axes.length, "axe", "axes")}
                  </span>
                </div>
                {dimension.description ? (
                  <p className="m-0 text-[14px] text-tx2">{dimension.description}</p>
                ) : null}
                {dimension.hierarchies.map((hierarchy) => (
                  <div
                    key={hierarchy.label}
                    className="flex flex-wrap items-center gap-1.5 text-[13.5px]"
                  >
                    <span className="font-semibold text-tx3">{hierarchy.label}</span>
                    {hierarchy.levels.map((level, index) => (
                      <span key={level} className="flex items-center gap-1.5 text-tx2">
                        {index ? <span className="text-tx3">›</span> : null}
                        {level}
                      </span>
                    ))}
                  </div>
                ))}
                <ul className="m-0 flex list-none flex-col p-0">
                  {dimension.axes.map((axis) => (
                    <li
                      key={axis.ref}
                      className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-sunk py-2.5"
                    >
                      <span className="min-w-[140px] text-[14.5px] font-medium">{axis.label}</span>
                      <span className="min-w-0 flex-1">
                        <Synonyms words={axis.synonyms.slice(0, 5)} />
                      </span>
                      {firstMetric ? (
                        <Link
                          href={ask(questionWith(firstMetric, axis))}
                          className="text-meta font-medium whitespace-nowrap text-acc-tx"
                        >
                          {firstMetric.label} par {axis.label.toLowerCase()}
                        </Link>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </Card>
            ))}
          </div>
        </section>
      ) : null}
    </ScreenBody>
  );
}
