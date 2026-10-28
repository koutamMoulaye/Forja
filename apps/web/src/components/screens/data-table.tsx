"use client";

import { HatchGlyph } from "@/components/ui/spinner";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";
import { shortValue } from "@/lib/format";

const number = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 6 });

function cell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return number.format(value);
  if (typeof value === "boolean") return value ? "vrai" : "faux";
  if (typeof value === "string") return shortValue(value);
  return JSON.stringify(value);
}

/**
 * DataTable of the inventory: 38 px rows, tabular figures, pseudonymized columns hatched.
 * Numbers align right; long values are cut with an ellipsis, the full value in a title.
 */
export function DataTable({
  columns,
  rows,
  personal = [],
  loading = false,
  empty = "Aucune ligne.",
  label,
  maxHeight,
  className,
}: {
  columns: string[];
  rows: Record<string, unknown>[];
  personal?: string[];
  loading?: boolean;
  empty?: string;
  label: string;
  maxHeight?: number;
  className?: string;
}) {
  const hatched = new Set(personal);
  if (loading) {
    return (
      <div
        className="flex flex-col gap-1.5 p-3"
        aria-busy="true"
        aria-label={`${label}, chargement`}
      >
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} className="h-[30px] w-full rounded-md" />
        ))}
      </div>
    );
  }
  return (
    <div className={cn("overflow-auto", className)} style={{ maxHeight }}>
      <table aria-label={label} className="w-full border-collapse text-[13.5px] tabular-nums">
        <thead className="sticky top-0 z-[1] bg-node">
          <tr>
            {columns.map((column) => (
              <th
                key={column}
                scope="col"
                className="h-9 px-3 text-left text-[12.5px] font-semibold whitespace-nowrap text-tx3"
              >
                <span className="inline-flex items-center gap-1.5">
                  {hatched.has(column) ? (
                    <span className="text-pii-fg" title="Pseudonymisée">
                      <HatchGlyph size={11} />
                    </span>
                  ) : null}
                  <span className="font-mono text-mono">{column}</span>
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-3 py-8 text-center text-ui text-tx3">
                {empty}
              </td>
            </tr>
          ) : (
            rows.map((row, index) => (
              <tr key={index} className="h-[38px] border-t border-sunk">
                {columns.map((column) => {
                  const value = row[column];
                  const text = cell(value);
                  return (
                    <td
                      key={column}
                      title={typeof value === "string" ? value : undefined}
                      className={cn(
                        "max-w-[240px] truncate px-3",
                        typeof value === "number" && "text-right",
                        value === null && "text-tx3",
                        hatched.has(column) && "font-mono text-mono text-pii-fg hatch-pii",
                      )}
                    >
                      {value === null ? "—" : text}
                    </td>
                  );
                })}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
