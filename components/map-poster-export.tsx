"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Download, FileImage, Link2, Loader2, RefreshCw, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useFocusTrap } from "@/lib/use-focus-trap";
import { cn } from "@/lib/utils";

type PosterState = {
  posterUrl: string | null;
  posterGeneratedAt: string | null;
};

/**
 * "Export poster" entry point for the map view. Lives next to the
 * visibility toggle so the owner can hop directly from "publish" to
 * "share the artwork".
 *
 * The dialog is intentionally read-only for non-owners: the trigger
 * still shows up so any viewer can copy a link to a previously
 * generated poster, but the Generate / Regenerate controls only render
 * when `canMutate` is true.
 */
export function MapPosterExport({
  slug,
  canMutate,
  initialPosterUrl,
  initialPosterGeneratedAt,
}: {
  slug: string;
  canMutate: boolean;
  initialPosterUrl?: string | null;
  initialPosterGeneratedAt?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<PosterState>({
    posterUrl: initialPosterUrl ?? null,
    posterGeneratedAt: initialPosterGeneratedAt ?? null,
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<null | "link">(null);

  const handleGenerate = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/maps/${slug}/poster`, { method: "POST" });
      const payload = (await res.json().catch(() => null)) as
        | { posterUrl?: string; posterGeneratedAt?: string; error?: string }
        | null;
      if (!res.ok || !payload?.posterUrl) {
        throw new Error(payload?.error ?? `Poster generation failed (${res.status}).`);
      }
      setState({
        posterUrl: payload.posterUrl,
        posterGeneratedAt: payload.posterGeneratedAt ?? new Date().toISOString(),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Poster generation failed.");
    } finally {
      setBusy(false);
    }
  }, [slug]);

  const handleCopyLink = useCallback(async () => {
    if (!state.posterUrl) return;
    try {
      await navigator.clipboard.writeText(state.posterUrl);
      setCopied("link");
      window.setTimeout(() => setCopied(null), 1600);
    } catch {
      setError("Could not copy link.");
    }
  }, [state.posterUrl]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-8 items-center gap-1.5 border border-border bg-card px-2.5 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground transition-colors duration-150 hover:border-foreground/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Export poster"
      >
        <FileImage className="h-3.5 w-3.5" aria-hidden strokeWidth={2} />
        <span>Export</span>
      </button>

      {open ? (
        <PosterDialog
          slug={slug}
          canMutate={canMutate}
          state={state}
          error={error}
          busy={busy}
          copied={copied}
          onClose={() => setOpen(false)}
          onGenerate={handleGenerate}
          onCopyLink={handleCopyLink}
        />
      ) : null}
    </>
  );
}

function PosterDialog({
  slug,
  canMutate,
  state,
  error,
  busy,
  copied,
  onClose,
  onGenerate,
  onCopyLink,
}: {
  slug: string;
  canMutate: boolean;
  state: PosterState;
  error: string | null;
  busy: boolean;
  copied: null | "link";
  onClose: () => void;
  onGenerate: () => void | Promise<void>;
  onCopyLink: () => void | Promise<void>;
}) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const titleId = useId();
  useFocusTrap(dialogRef, true);

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose, busy]);

  const generatedLabel = state.posterGeneratedAt
    ? new Date(state.posterGeneratedAt).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : null;

  const downloadName = `${slug}-poster.png`;

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-[color:color-mix(in_srgb,var(--foreground)_58%,transparent)] p-4"
      onClick={() => {
        if (!busy) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-busy={busy}
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-md border border-border bg-background shadow-[var(--shadow-overlay)]"
      >
        <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-primary">Poster</p>
            <h3
              id={titleId}
              className="mt-1 font-sans text-[15px] font-semibold leading-tight tracking-[-0.01em] text-foreground"
            >
              Export poster
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="inline-flex h-7 w-7 items-center justify-center border border-border bg-card text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Close"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>

        <div className="px-4 py-4">
          <div
            className={cn(
              "relative flex aspect-square w-full items-center justify-center overflow-hidden border border-border bg-muted",
              !state.posterUrl && "bg-card",
            )}
          >
            {state.posterUrl ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={state.posterUrl}
                  alt="Generated poster preview"
                  className="h-full w-full object-contain"
                />
                {busy ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[color:color-mix(in_srgb,var(--background)_72%,transparent)] backdrop-blur-sm">
                    <Spinner size="md" className="text-primary" />
                    <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-foreground">
                      Regenerating…
                    </p>
                  </div>
                ) : null}
              </>
            ) : busy ? (
              <div className="flex flex-col items-center gap-2 px-5 py-6 text-center">
                <Spinner size="md" className="text-primary" />
                <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-foreground">
                  Generating…
                </p>
                <p className="max-w-[18rem] text-[11.5px] leading-snug text-muted-foreground">
                  Composing your grid into a single artwork. This typically takes about a minute.
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 px-5 py-6 text-center">
                <FileImage className="h-6 w-6 text-muted-foreground" aria-hidden strokeWidth={1.5} />
                <p className="font-sans text-[13.5px] font-semibold leading-snug text-foreground">
                  No poster yet
                </p>
                <p className="max-w-[18rem] text-[11.5px] leading-snug text-muted-foreground">
                  {canMutate
                    ? "Generate a single shareable image from every cell."
                    : "The owner hasn't generated a poster yet."}
                </p>
              </div>
            )}
          </div>

          {error ? (
            <p
              role="alert"
              className="mt-2.5 font-mono text-[10px] uppercase tracking-[0.18em] text-[color:var(--destructive)]"
            >
              {error}
            </p>
          ) : null}

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              {state.posterUrl
                ? generatedLabel
                  ? generatedLabel
                  : "Saved"
                : "Not yet generated"}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {state.posterUrl ? (
                <>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={onCopyLink}
                    disabled={busy}
                  >
                    <Link2 className="h-3.5 w-3.5" aria-hidden />
                    {copied === "link" ? "Copied" : "Copy link"}
                  </Button>
                  <Button asChild variant="secondary" size="sm">
                    <a
                      href={state.posterUrl}
                      download={downloadName}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Download className="h-3.5 w-3.5" aria-hidden />
                      Download
                    </a>
                  </Button>
                </>
              ) : null}
              {canMutate ? (
                <Button type="button" size="sm" onClick={onGenerate} disabled={busy}>
                  {busy ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                  ) : state.posterUrl ? (
                    <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5" aria-hidden />
                  )}
                  {state.posterUrl ? "Regenerate" : "Generate poster"}
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
