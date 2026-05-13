import { cn } from "@/lib/utils";

interface AxisVisualGuideProps {
  className?: string;
  primaryLabel?: string;
  secondaryLabel?: string;
  primaryValues?: string[];
  secondaryValues?: string[];
}

const FALLBACK_COLUMNS = ["Column A", "Column B", "Column C", "Column D", "Column E"] as const;
const FALLBACK_ROWS = ["Row 1", "Row 2", "Row 3", "Row 4", "Row 5"] as const;
/** Matches suggest-axis schema upper bound so the preview grid stays readable. */
const PREVIEW_AXIS_CAP = 5;

function axisDisplayTitle(raw: string | undefined): string {
  const t = (raw || "").trim();
  if (!t) return "";
  if (/^(rows?|columns?)$/i.test(t)) return "";
  return t;
}

function axisTickLabels(values: string[] | undefined, fallbacks: readonly string[]): string[] {
  const raw = (values ?? []).map((v) => v.trim()).filter(Boolean);
  const n = Math.min(
    PREVIEW_AXIS_CAP,
    Math.max(3, raw.length >= 3 ? raw.length : 3),
  );
  return Array.from({ length: n }, (_, index) => {
    const fromInput = raw[index]?.trim();
    if (fromInput) return fromInput;
    return fallbacks[index] ?? fallbacks[fallbacks.length - 1] ?? "";
  });
}

export function AxisVisualGuide({
  className,
  primaryLabel,
  secondaryLabel,
  primaryValues,
  secondaryValues,
}: AxisVisualGuideProps) {
  const xTitle = axisDisplayTitle(primaryLabel);
  const yTitle = axisDisplayTitle(secondaryLabel);
  const columns = axisTickLabels(primaryValues, FALLBACK_COLUMNS);
  const rows = axisTickLabels(secondaryValues, FALLBACK_ROWS);
  const pairTitle = [yTitle, xTitle].filter(Boolean).join(" × ") || "Axis preview";

  return (
    <section
      className={cn(
        "flex h-full w-full flex-col border border-border bg-card text-foreground",
        "shadow-[inset_0_1px_0_color-mix(in_srgb,var(--foreground)_5%,transparent)]",
        className,
      )}
      aria-label="Generated output preview"
    >
      <div className="border-b border-border px-3 py-2.5">
        <div className="flex items-start justify-between gap-3">
          <p className="font-mono text-[10px] font-medium uppercase leading-none tracking-[0.22em] text-foreground/80">
            2. Output Preview
          </p>
          <span className="shrink-0 border border-primary/45 px-1.5 py-0.5 font-mono text-[9px] font-medium uppercase tracking-[0.18em] text-primary">
            Result
          </span>
        </div>

        <div className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 border border-border-strong bg-muted/70" aria-hidden />
            Known
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 border border-primary bg-[color:color-mix(in_srgb,var(--primary)_14%,transparent)]" aria-hidden />
            New
          </span>
        </div>
      </div>

      <div className="flex flex-1 flex-col px-3 py-3">
        <p className="mb-3 shrink-0 px-2 text-center text-[13px] font-semibold leading-snug tracking-[-0.01em] text-foreground normal-case">
          {pairTitle}
        </p>
        <div className="relative flex min-h-0 flex-1 overflow-hidden border border-border bg-background/65">
          <span aria-hidden className="pointer-events-none absolute left-0 top-0 z-10 select-none font-mono text-[10px] leading-none text-foreground/70">+</span>
          <span aria-hidden className="pointer-events-none absolute right-0 top-0 z-10 select-none font-mono text-[10px] leading-none text-foreground/70">+</span>
          <span aria-hidden className="pointer-events-none absolute bottom-0 left-0 z-10 select-none font-mono text-[10px] leading-none text-foreground/70">+</span>
          <span aria-hidden className="pointer-events-none absolute bottom-0 right-0 z-10 select-none font-mono text-[10px] leading-none text-foreground/70">+</span>
          <table className="w-full border-collapse text-left">
            <thead>
              <tr>
                <td
                  className="w-[min(7rem,22vw)] min-w-[4.25rem] border-b border-r border-border bg-card/70 sm:w-[7rem]"
                  aria-hidden
                />
                {columns.map((column, columnIndex) => (
                  <th
                    key={`col-${columnIndex}`}
                    scope="col"
                    className="max-w-[min(12rem,28vw)] border-b border-r border-border bg-card/70 px-2 py-2 align-bottom last:border-r-0 sm:max-w-none sm:min-w-[5.5rem]"
                  >
                    <span className="block whitespace-normal break-words text-left text-[12px] font-semibold leading-snug tracking-[-0.01em] text-foreground">
                      {column}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={`row-${rowIndex}`}>
                  <th
                    scope="row"
                    className="border-r border-t border-border bg-card/45 px-2 py-2 align-middle"
                  >
                    <span className="block whitespace-normal break-words text-left text-[12px] font-medium leading-snug text-muted-foreground">
                      {row}
                    </span>
                  </th>
                  {columns.map((column, columnIndex) => {
                    return (
                      <td
                        key={`c${columnIndex}-r${rowIndex}`}
                        className="h-12 border-t border-r border-border bg-background/35 p-1.5 last:border-r-0"
                      >
                        <div
                          className={cn(
                            "flex h-full min-h-8 items-center justify-center border border-border-strong/30 bg-muted/35 text-center text-muted-foreground",
                          )}
                        >
                          <span className="font-mono text-[11px] font-semibold leading-none tracking-[0.12em]">
                            {String(rowIndex * columns.length + columnIndex + 1).padStart(2, "0")}
                          </span>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
