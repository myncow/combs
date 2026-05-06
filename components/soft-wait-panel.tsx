import { Spinner } from "@/components/ui/spinner";

export type StepRow = { key: string; label: string; status: "pending" | "running" | "done" };

export const SOFT_WAIT_STAGE_ORDER = ["normalize_brief", "research", "skeleton", "cells", "post_process"] as const;

export function summarizeSoftWait(steps: StepRow[], busy: boolean) {
  const statusByStage = new Map<string, StepRow["status"]>();

  for (const row of steps) {
    const stage = row.key.split(":")[0] ?? row.key;
    const previous = statusByStage.get(stage);
    if (row.status === "done" || previous !== "done") {
      statusByStage.set(stage, row.status);
    }
  }

  const runningStage = SOFT_WAIT_STAGE_ORDER.find((stage) => statusByStage.get(stage) === "running");
  const doneCount = SOFT_WAIT_STAGE_ORDER.filter((stage) => statusByStage.get(stage) === "done").length;
  const progress = Math.min(
    0.96,
    Math.max(
      busy ? 0.08 : 0,
      (doneCount + (runningStage ? 0.58 : 0)) / SOFT_WAIT_STAGE_ORDER.length,
    ),
  );

  if (!busy && doneCount === 0) {
    return { progress, title: "Waiting for a topic" };
  }

  if (!runningStage && doneCount === 0) {
    return { progress, title: "Starting…" };
  }

  switch (runningStage) {
    case "normalize_brief":
      return { progress, title: "Framing the topic" };
    case "research":
      return { progress, title: "Gathering references" };
    case "skeleton":
      return { progress, title: "Sketching the grid" };
    case "cells":
      return { progress, title: "Trying crossings" };
    case "post_process":
      return { progress, title: "Finishing up" };
    default:
      return {
        progress,
        title: doneCount === SOFT_WAIT_STAGE_ORDER.length ? "Opening map…" : "Building…",
      };
  }
}

export function SoftWaitPanel({
  busy,
  steps,
  usageLines,
}: {
  busy: boolean;
  steps: StepRow[];
  usageLines: string[];
}) {
  const summary = summarizeSoftWait(steps, busy);
  const width = `${Math.round(summary.progress * 100)}%`;
  const usageLine = usageLines.at(-1);

  return (
    <section aria-live="polite" className="shrink-0 space-y-2 border-t border-border/80 pt-3">
      <div className="flex items-center gap-2">
        {busy ? <Spinner size="sm" className="text-muted-foreground" /> : null}
        <p className="min-w-0 flex-1 text-[14px] font-medium leading-snug tracking-[-0.01em] text-foreground">
          {summary.title}
        </p>
      </div>

      <div className="h-px overflow-hidden rounded-full bg-border">
        <div
          className="h-full rounded-full bg-foreground/25 transition-[width] duration-700 ease-out"
          style={{ width }}
        />
      </div>

      {usageLine ? (
        <p className="text-[12px] leading-snug text-muted-foreground">{usageLine}</p>
      ) : null}
    </section>
  );
}
