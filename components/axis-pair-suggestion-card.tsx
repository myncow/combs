"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SuggestAxisPairInput } from "@/lib/schema";

export function axisPairKey(pair: SuggestAxisPairInput) {
  return `${pair.primary.key}::${pair.secondary.key}`;
}

export function AxisPairSuggestionCard({
  pair,
  selected,
  onSelect,
  compact = false,
}: {
  pair: SuggestAxisPairInput;
  selected: boolean;
  onSelect: () => void;
  compact?: boolean;
}) {
  const rationale = (pair.rationale ?? "").trim();

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "group flex w-full flex-col justify-between border border-border bg-[color:color-mix(in_srgb,var(--card)_72%,var(--background))] text-left transition-colors duration-150",
        compact ? "min-h-0 gap-3 px-3 py-3" : "h-full min-h-[11rem] gap-4 px-4 py-4",
        "hover:border-foreground/25 hover:bg-card/95",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        selected &&
          "border-primary bg-[color:color-mix(in_srgb,var(--primary)_9%,var(--card))]",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          {selected ? "Locked" : "Suggest"}
        </span>
        <span
          aria-hidden
          className={cn(
            "inline-flex shrink-0 items-center justify-center rounded-sm border transition-colors",
            compact ? "h-4 w-4" : "h-5 w-5",
            selected ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background",
          )}
        >
          {selected ? <Check className={compact ? "h-2.5 w-2.5" : "h-3 w-3"} strokeWidth={2.5} /> : null}
        </span>
      </div>

      <div className={cn("grid flex-1", compact ? "gap-2" : "gap-3")}>
        <div
          className={cn(
            "grid gap-2",
            compact ? "grid-cols-1" : "gap-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-start",
          )}
        >
          <div className="min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Primary</p>
            <p
              className={cn(
                "mt-0.5 font-semibold leading-[1.15] tracking-[-0.015em] text-foreground",
                compact ? "text-[15px]" : "mt-1 text-[18px]",
              )}
            >
              {pair.primary.label}
            </p>
            {!compact && pair.primary.description ? (
              <p className="mt-1 line-clamp-2 text-[13px] leading-[1.45] text-muted-foreground">
                {pair.primary.description}
              </p>
            ) : null}
          </div>

          {!compact ? (
            <div className="hidden self-start pt-5 sm:block">
              <span className="font-mono text-[13px] text-muted-foreground">×</span>
            </div>
          ) : (
            <div className="flex justify-center py-0.5">
              <span className="font-mono text-[11px] text-muted-foreground">×</span>
            </div>
          )}

          <div className="min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Secondary</p>
            <p
              className={cn(
                "mt-0.5 font-semibold leading-[1.15] tracking-[-0.015em] text-foreground",
                compact ? "text-[15px]" : "mt-1 text-[18px]",
              )}
            >
              {pair.secondary.label}
            </p>
            {!compact && pair.secondary.description ? (
              <p className="mt-1 line-clamp-2 text-[13px] leading-[1.45] text-muted-foreground">
                {pair.secondary.description}
              </p>
            ) : null}
          </div>
        </div>

        {rationale && !compact ? (
          <p className="line-clamp-3 text-[14px] leading-[1.5] text-muted-foreground">{rationale}</p>
        ) : rationale && compact ? (
          <p className="line-clamp-2 text-[12px] leading-snug text-muted-foreground">{rationale}</p>
        ) : null}
      </div>

      {!compact ? (
        <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
          <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
            {selected ? "Using this frame" : "Use this frame"}
          </span>
          <span
            className={cn(
              "font-mono text-[11px] uppercase tracking-[0.22em] transition-colors",
              selected ? "text-primary" : "text-muted-foreground group-hover:text-foreground",
            )}
          >
            {selected ? "Selected" : "Select"}
          </span>
        </div>
      ) : null}
    </button>
  );
}
