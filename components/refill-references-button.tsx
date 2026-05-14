"use client";

import { useActionState } from "react";
import { RefreshCw } from "lucide-react";
import {
  refillMapReferenceImagesAction,
  type RefillReferenceImagesState,
} from "@/app/actions";
import { Button } from "@/components/ui/button";

const INITIAL: RefillReferenceImagesState = { status: "idle" };

export function RefillReferencesButton({ slug }: { slug: string }) {
  const [state, formAction, isPending] = useActionState(
    refillMapReferenceImagesAction,
    INITIAL,
  );

  return (
    <form action={formAction} className="inline-flex items-center gap-2">
      <input type="hidden" name="slug" value={slug} />
      <Button
        type="submit"
        variant="secondary"
        size="sm"
        disabled={isPending}
        title="Re-run SerpApi reference enrichment against this map"
      >
        <RefreshCw
          className={isPending ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"}
          aria-hidden
        />
        {isPending ? "Refilling…" : "Refill refs"}
      </Button>
      {state.status === "success" ? (
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-primary">
          +{state.filled}
        </span>
      ) : null}
      {state.status === "error" ? (
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[color:var(--destructive)]">
          {state.message}
        </span>
      ) : null}
    </form>
  );
}
