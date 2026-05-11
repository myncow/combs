"use client";

import { Globe, Lock } from "lucide-react";
import { useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

export function MapVisibilityControl({
  slug,
  initialIsPublic,
  canMutate,
  viewerLabel,
}: {
  slug: string;
  initialIsPublic: boolean;
  canMutate: boolean;
  /** Optional badge text shown next to the toggle (e.g. "Admin override"). */
  viewerLabel?: string;
}) {
  const router = useRouter();
  const [isPublic, setIsPublic] = useState(initialIsPublic);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function toggle(next: boolean) {
    setError(null);
    const previous = isPublic;
    setIsPublic(next);
    try {
      const res = await fetch(`/api/maps/${slug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPublic: next }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Could not update visibility.");
      }
      startTransition(() => {
        router.refresh();
      });
    } catch (err) {
      setIsPublic(previous);
      setError(err instanceof Error ? err.message : "Could not update visibility.");
    }
  }

  return (
    <div className="flex items-center gap-2">
      {viewerLabel ? (
        <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
          {viewerLabel}
        </span>
      ) : null}
      <button
        type="button"
        disabled={!canMutate || pending}
        onClick={() => toggle(!isPublic)}
        className={cn(
          "inline-flex h-8 items-center gap-1.5 border px-2.5 font-mono text-[11px] uppercase tracking-[0.18em] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          isPublic
            ? "border-primary/40 bg-[color:color-mix(in_srgb,var(--primary)_8%,var(--background))] text-primary"
            : "border-border bg-card text-muted-foreground hover:text-foreground",
          (!canMutate || pending) && "cursor-not-allowed opacity-60",
        )}
        aria-pressed={isPublic}
        title={
          canMutate
            ? isPublic
              ? "Public — anyone with the link or visiting the gallery can see this map."
              : "Private — only you (and admins) can see this map."
            : "Read-only"
        }
      >
        {isPublic ? (
          <Globe className="h-3.5 w-3.5" aria-hidden strokeWidth={2} />
        ) : (
          <Lock className="h-3.5 w-3.5" aria-hidden strokeWidth={2} />
        )}
        <span>{isPublic ? "Public" : "Private"}</span>
      </button>
      {error ? (
        <span
          role="alert"
          className="font-mono text-[10px] uppercase tracking-[0.18em] text-[color:var(--destructive)]"
        >
          {error}
        </span>
      ) : null}
    </div>
  );
}
