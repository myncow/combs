"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Copy, Download, Link2 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

function normalizeCaption({
  title,
  summary,
  mapTitle,
  href,
}: {
  title: string;
  summary: string;
  mapTitle: string;
  href: string;
}) {
  return `${title}\n${summary}\nFrom ${mapTitle}\n${href}`;
}

export function LeaderboardShareActions({
  slug,
  title,
  summary,
  mapTitle,
  imageUrl,
  sourceHref,
  variant = "buttons",
  className,
}: {
  slug: string;
  title: string;
  summary: string;
  mapTitle: string;
  imageUrl: string;
  /** Optional: when set, includes a "view source map" action. */
  sourceHref?: string;
  /**
   * "buttons" = labeled secondary buttons in a wrapping row (legacy).
   * "icons"   = compact icon-only row, sized for overlay over the image.
   */
  variant?: "buttons" | "icons";
  className?: string;
}) {
  const [feedback, setFeedback] = useState<null | "link" | "caption" | "error">(null);
  const href = useMemo(() => {
    if (typeof window === "undefined") {
      return `/leaderboard/${slug}`;
    }
    return new URL(`/leaderboard/${slug}`, window.location.origin).toString();
  }, [slug]);

  async function copyText(kind: "link" | "caption") {
    try {
      const text =
        kind === "link"
          ? href
          : normalizeCaption({
              title,
              summary,
              mapTitle,
              href,
            });
      await navigator.clipboard.writeText(text);
      setFeedback(kind);
      window.setTimeout(() => setFeedback(null), 1600);
    } catch {
      setFeedback("error");
      window.setTimeout(() => setFeedback(null), 1600);
    }
  }

  if (variant === "icons") {
    return (
      <div
        className={cn(
          "flex items-center gap-1 border border-border/70 bg-background/85 p-0.5 shadow-sm backdrop-blur-sm",
          className,
        )}
      >
        <IconAction
          label={feedback === "link" ? "Copied" : "Copy link"}
          onClick={() => void copyText("link")}
          icon={<Link2 className="h-3.5 w-3.5" aria-hidden strokeWidth={1.75} />}
          active={feedback === "link"}
        />
        <IconAction
          label={feedback === "caption" ? "Copied" : "Copy caption"}
          onClick={() => void copyText("caption")}
          icon={<Copy className="h-3.5 w-3.5" aria-hidden strokeWidth={1.75} />}
          active={feedback === "caption"}
        />
        <IconAction
          label="Download image"
          icon={<Download className="h-3.5 w-3.5" aria-hidden strokeWidth={1.75} />}
          renderAs={
            <a
              href={imageUrl}
              download
              aria-label="Download image"
              className="inline-flex h-7 w-7 items-center justify-center text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Download className="h-3.5 w-3.5" aria-hidden strokeWidth={1.75} />
            </a>
          }
        />
        {sourceHref ? (
          <IconAction
            label="View source map"
            icon={<ArrowUpRight className="h-3.5 w-3.5" aria-hidden strokeWidth={1.75} />}
            renderAs={
              <Link
                href={sourceHref}
                aria-label="View source map"
                className="inline-flex h-7 w-7 items-center justify-center text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <ArrowUpRight className="h-3.5 w-3.5" aria-hidden strokeWidth={1.75} />
              </Link>
            }
          />
        ) : null}
      </div>
    );
  }

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex flex-wrap gap-2">
        <ButtonAction onClick={() => void copyText("link")}>
          <Link2 className="h-3.5 w-3.5" aria-hidden />
          Copy link
        </ButtonAction>
        <ButtonAction onClick={() => void copyText("caption")}>
          <Copy className="h-3.5 w-3.5" aria-hidden />
          Copy caption
        </ButtonAction>
        <a
          href={imageUrl}
          download
          className="inline-flex h-9 items-center gap-2 border border-border bg-card px-3 font-mono text-[11px] uppercase tracking-[0.18em] text-foreground transition-colors hover:bg-foreground/5"
        >
          <Download className="h-3.5 w-3.5" aria-hidden />
          Download image
        </a>
      </div>
      {feedback ? (
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-primary">
          {feedback === "link"
            ? "Link copied."
            : feedback === "caption"
              ? "Caption copied."
              : "Copy unavailable in this browser."}
        </p>
      ) : null}
    </div>
  );
}

function ButtonAction({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-9 items-center gap-2 border border-border bg-card px-3 font-mono text-[11px] uppercase tracking-[0.18em] text-foreground transition-colors hover:bg-foreground/5"
    >
      {children}
    </button>
  );
}

function IconAction({
  label,
  icon,
  onClick,
  active,
  renderAs,
}: {
  label: string;
  icon: React.ReactNode;
  onClick?: () => void;
  active?: boolean;
  renderAs?: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {renderAs ?? (
          <button
            type="button"
            onClick={onClick}
            aria-label={label}
            className={cn(
              "inline-flex h-7 w-7 items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active
                ? "text-primary"
                : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
            )}
          >
            {icon}
          </button>
        )}
      </TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  );
}
