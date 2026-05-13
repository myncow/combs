"use client";

import { useState } from "react";
import { DollarSign, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { MenuPanel } from "@/components/raster-shell";
import { formatUsd, type MapCostBreakdown } from "@/lib/pricing";

export function MapCostBadge({ breakdown }: { breakdown: MapCostBreakdown }) {
  const [open, setOpen] = useState(false);

  const total = breakdown.totalUsd;
  if (total === 0 && breakdown.generationLines.length === 0 && breakdown.visualizationLines.length === 0) {
    return null;
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Generation cost breakdown"
        aria-label={`Cost: ${formatUsd(total)}. Click for breakdown.`}
        className={cn(
          "inline-flex h-7 items-center gap-1.5 border px-2 font-mono text-[11px] uppercase tracking-[0.16em] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          "border-border bg-background text-muted-foreground hover:border-foreground/30 hover:text-foreground",
          open && "border-foreground/40 text-foreground",
        )}
      >
        <DollarSign className="h-3 w-3 shrink-0" aria-hidden strokeWidth={2} />
        {formatUsd(total)}
      </button>

      {open ? (
        <MenuPanel
          role="dialog"
          aria-label="Cost breakdown"
          className="absolute right-0 top-full z-40 mt-1.5 w-[min(300px,90vw)] origin-top-right p-3"
        >
          <div className="flex items-center justify-between gap-2 pb-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-foreground/60">
              Cost breakdown
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close cost breakdown"
              className="inline-flex h-5 w-5 items-center justify-center text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <X className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
            </button>
          </div>

          {breakdown.generationLines.length > 0 ? (
            <section className="pb-2">
              <p className="pb-1 font-mono text-[10px] uppercase tracking-[0.2em] text-foreground/50">
                Generation
              </p>
              {breakdown.generationLines.map((line) => (
                <CostRow key={line.label} label={line.label} usd={line.usd} detail={line.detail} />
              ))}
              <CostRow
                label="Subtotal"
                usd={breakdown.generationUsd}
                bold
              />
            </section>
          ) : null}

          {breakdown.visualizationLines.length > 0 ? (
            <section className={cn("pb-2", breakdown.generationLines.length > 0 && "border-t border-border pt-2")}>
              <p className="pb-1 font-mono text-[10px] uppercase tracking-[0.2em] text-foreground/50">
                Cell images
              </p>
              {breakdown.visualizationLines.map((line, i) => (
                <CostRow key={`${line.label}-${i}`} label={line.label} usd={line.usd} />
              ))}
              <CostRow
                label="Subtotal"
                usd={breakdown.visualizationUsd}
                bold
              />
            </section>
          ) : null}

          <div className="border-t border-border pt-2">
            <CostRow label="Total" usd={breakdown.totalUsd} bold />
          </div>

          <p className="pt-2 font-mono text-[10px] leading-snug text-foreground/40">
            Estimated · actual billing may differ
          </p>
        </MenuPanel>
      ) : null}
    </div>
  );
}

function CostRow({
  label,
  usd,
  detail,
  bold,
}: {
  label: string;
  usd: number;
  detail?: string;
  bold?: boolean;
}) {
  return (
    <div className={cn("flex items-baseline justify-between gap-3 py-0.5", bold && "font-semibold")}>
      <span className={cn("min-w-0 truncate font-sans text-[12px] text-foreground/75", bold && "text-foreground")}>
        {label}
        {detail ? (
          <span className="ml-1 font-mono text-[10px] font-normal text-foreground/40">{detail}</span>
        ) : null}
      </span>
      <span className={cn("shrink-0 font-mono text-[12px] tabular-nums text-foreground/75", bold && "text-foreground")}>
        {formatUsd(usd)}
      </span>
    </div>
  );
}
