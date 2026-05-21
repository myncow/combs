"use client";

import { Trash2 } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
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
  const [open, setOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function performDelete() {
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
      setOpen(false);

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

  const triggerButton =
    variant === "text" ? (
      <button
        type="button"
        disabled={isDeleting}
        className={cn(
          "inline-flex h-9 items-center gap-2 border border-[color:var(--destructive)] bg-transparent px-3",
          "font-mono text-[12px] uppercase tracking-[0.22em] text-[color:var(--destructive)]",
          "transition-[color,background-color] duration-150 touch-manipulation hover:bg-[color:var(--destructive)] hover:text-[color:var(--destructive-foreground)]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          "disabled:cursor-not-allowed disabled:opacity-60",
          className,
        )}
      >
        {isDeleting ? <Spinner size="sm" /> : <Trash2 className="h-3.5 w-3.5" aria-hidden />}
        {isDeleting ? "Deleting…" : label}
      </button>
    ) : (
      <button
        type="button"
        disabled={isDeleting}
        aria-label={`Delete ${title}`}
        className={cn(
          "inline-flex h-9 w-9 shrink-0 items-center justify-center border border-border bg-background text-muted-foreground",
          "transition-[color,border-color] duration-150 touch-manipulation hover:border-[color:var(--destructive)] hover:text-[color:var(--destructive)]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          "disabled:cursor-not-allowed disabled:opacity-60",
          className,
        )}
      >
        {isDeleting ? <Spinner size="sm" /> : <Trash2 className="h-4 w-4" aria-hidden />}
      </button>
    );

  return (
    <div className="inline-flex flex-col items-start gap-2">
      <AlertDialog open={open} onOpenChange={(next) => (!isDeleting ? setOpen(next) : null)}>
        <AlertDialogTrigger asChild>{triggerButton}</AlertDialogTrigger>
        <AlertDialogContent className="rounded-none border-border">
          <AlertDialogHeader>
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[color:var(--destructive)]">
              Delete map
            </p>
            <AlertDialogTitle className="mt-1 truncate font-sans text-[18px] font-semibold leading-tight tracking-[-0.015em] text-foreground">
              {title}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-[14px] leading-relaxed text-muted-foreground">
              This removes the map from your library. The action can&rsquo;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {error ? (
            <p
              role="alert"
              aria-live="polite"
              className="font-mono text-[11px] uppercase tracking-[0.2em] text-[color:var(--destructive)]"
            >
              {error}
            </p>
          ) : null}

          <AlertDialogFooter>
            <AlertDialogCancel asChild>
              <Button type="button" variant="secondary" size="sm" disabled={isDeleting}>
                Cancel
              </Button>
            </AlertDialogCancel>
            <AlertDialogAction asChild>
              <button
                type="button"
                onClick={(event) => {
                  event.preventDefault();
                  void performDelete();
                }}
                disabled={isDeleting}
                className={cn(
                  "inline-flex h-9 items-center gap-2 border border-[color:var(--destructive)] bg-[color:var(--destructive)] px-3",
                  "font-mono text-[11px] uppercase tracking-[0.22em] text-[color:var(--destructive-foreground)]",
                  "transition-[background-color] duration-150 touch-manipulation hover:bg-[color:color-mix(in_srgb,var(--destructive)_88%,var(--foreground))]",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--destructive)] focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  "disabled:cursor-not-allowed disabled:opacity-60",
                )}
              >
                {isDeleting ? <Spinner size="sm" /> : <Trash2 className="h-3.5 w-3.5" aria-hidden />}
                {isDeleting ? "Deleting…" : "Delete"}
              </button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {error && !open ? (
        <span
          aria-live="polite"
          className="font-mono text-[11px] uppercase tracking-[0.2em] text-[color:var(--destructive)]"
          role="alert"
        >
          {error}
        </span>
      ) : null}
    </div>
  );
}
