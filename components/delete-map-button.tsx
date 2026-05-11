"use client";

import { Trash2, X } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
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
  const [confirmOpen, setConfirmOpen] = useState(false);
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
      setConfirmOpen(false);

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

  function openConfirm() {
    setError(null);
    setConfirmOpen(true);
  }

  function closeConfirm() {
    if (isDeleting) return;
    setConfirmOpen(false);
  }

  const trigger =
    variant === "text" ? (
      <div className="inline-flex flex-col items-start gap-2">
        <button
          type="button"
          onClick={openConfirm}
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
        {error && !confirmOpen ? (
          <span
            className="font-mono text-[11px] uppercase tracking-[0.2em] text-[color:var(--destructive)]"
            role="alert"
          >
            {error}
          </span>
        ) : null}
      </div>
    ) : (
      <div className="relative inline-flex">
        <button
          type="button"
          onClick={openConfirm}
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
        {error && !confirmOpen ? (
          <span
            className="absolute right-0 top-9 z-10 w-40 border border-[color:var(--destructive)] bg-background px-2 py-1 font-mono text-[11px] uppercase tracking-[0.2em] text-[color:var(--destructive)]"
            role="alert"
          >
            {error}
          </span>
        ) : null}
      </div>
    );

  return (
    <>
      {trigger}
      <ConfirmDeleteDialog
        open={confirmOpen}
        title={title}
        isDeleting={isDeleting}
        error={error}
        onCancel={closeConfirm}
        onConfirm={() => void performDelete()}
      />
    </>
  );
}

function ConfirmDeleteDialog({
  open,
  title,
  isDeleting,
  error,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  isDeleting: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    cancelRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel, open]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!open || !mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-[color:color-mix(in_srgb,var(--foreground)_58%,transparent)] p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onCancel();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-map-dialog-title"
        aria-describedby="delete-map-dialog-body"
        className="w-full max-w-md border border-border bg-background shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-3.5">
          <div className="min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[color:var(--destructive)]">
              Delete map
            </p>
            <h2
              id="delete-map-dialog-title"
              className="mt-1.5 truncate font-sans text-[18px] font-semibold leading-tight tracking-[-0.015em] text-foreground"
            >
              {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={isDeleting}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center border border-border bg-background text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-60"
            aria-label="Cancel"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div className="px-5 py-4">
          <p id="delete-map-dialog-body" className="text-[14px] leading-relaxed text-muted-foreground">
            This removes the map from your library. The action can&apos;t be undone.
          </p>
          {error ? (
            <p
              role="alert"
              className="mt-3 font-mono text-[11px] uppercase tracking-[0.2em] text-[color:var(--destructive)]"
            >
              {error}
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-5 py-3">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            ref={cancelRef}
            onClick={onCancel}
            disabled={isDeleting}
          >
            Cancel
          </Button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isDeleting}
            className={cn(
              "inline-flex h-9 items-center gap-2 border border-[color:var(--destructive)] bg-[color:var(--destructive)] px-3",
              "font-mono text-[11px] uppercase tracking-[0.22em] text-[color:var(--destructive-foreground)]",
              "transition-colors duration-150 hover:bg-[color:color-mix(in_srgb,var(--destructive)_88%,#000)]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--destructive)] focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              "disabled:cursor-not-allowed disabled:opacity-60",
            )}
          >
            {isDeleting ? <Spinner size="sm" /> : <Trash2 className="h-3.5 w-3.5" aria-hidden />}
            {isDeleting ? "Deleting" : "Delete"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
