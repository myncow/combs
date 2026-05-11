"use client";

import { Trash2 } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Spinner } from "@/components/ui/spinner";
import { dispatchLibraryRefresh } from "@/lib/client-events";
import { cn } from "@/lib/utils";

type DeleteMapButtonProps = {
  slug: string;
  title: string;
  redirectTo?: string;
  label?: string;
  variant?: "icon" | "text";
  className?: string;
  onDeleted?: (slug: string) => void;
};

export function DeleteMapButton({
  slug,
  title,
  redirectTo,
  label = "Delete",
  variant = "icon",
  className,
  onDeleted,
}: DeleteMapButtonProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    const confirmed = window.confirm(`Delete "${title}" from the local gallery?`);
    if (!confirmed) {
      return;
    }

    setIsDeleting(true);
    setError(null);

    try {
      const response = await fetch(`/api/maps/${encodeURIComponent(slug)}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Delete failed");
      }

      onDeleted?.(slug);
      dispatchLibraryRefresh();

      const isCurrentMap = pathname === `/maps/${slug}`;
      const nextPath = redirectTo ?? (isCurrentMap ? "/gallery" : null);

      if (nextPath) {
        router.replace(nextPath);
        return;
      }

      router.refresh();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Delete failed");
    } finally {
      setIsDeleting(false);
    }
  }

  if (variant === "text") {
    return (
      <div className="inline-flex flex-col items-start gap-2">
        <button
          type="button"
          onClick={handleDelete}
          disabled={isDeleting}
          className={cn(
            "inline-flex h-9 items-center gap-2 border border-[color:var(--destructive)] bg-transparent px-3",
            "font-mono text-[12px] uppercase tracking-[0.22em] text-[color:var(--destructive)]",
            "transition-colors duration-150 hover:bg-[color:var(--destructive)] hover:text-[color:var(--destructive-foreground)]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            "disabled:cursor-not-allowed disabled:opacity-60",
            className,
          )}
        >
          {isDeleting ? <Spinner size="sm" /> : <Trash2 className="h-3.5 w-3.5" />}
          {isDeleting ? "Deleting" : label}
        </button>
        {error ? (
          <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-[color:var(--destructive)]" role="alert">
            {error}
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <div className="relative inline-flex">
        <button
          type="button"
          onClick={handleDelete}
          disabled={isDeleting}
          className={cn(
            "inline-flex h-8 w-8 items-center justify-center border border-border bg-background text-muted-foreground",
            "transition-colors duration-150 hover:border-[color:var(--destructive)] hover:text-[color:var(--destructive)]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            "disabled:cursor-not-allowed disabled:opacity-60",
          className,
        )}
        title={`Delete ${title}`}
        aria-label={`Delete ${title}`}
      >
        {isDeleting ? <Spinner size="sm" /> : <Trash2 className="h-3.5 w-3.5" />}
      </button>
      {error ? (
        <span
          className="absolute right-0 top-9 z-10 w-40 border border-[color:var(--destructive)] bg-background px-2 py-1 font-mono text-[11px] uppercase tracking-[0.2em] text-[color:var(--destructive)]"
          role="alert"
        >
          {error}
        </span>
      ) : null}
    </div>
  );
}
