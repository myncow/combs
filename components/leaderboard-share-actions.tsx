"use client";

import { useMemo, useState } from "react";
import { Copy, Download, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";

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
}: {
  slug: string;
  title: string;
  summary: string;
  mapTitle: string;
  imageUrl: string;
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

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={() => void copyText("link")}>
          <Link2 className="h-3.5 w-3.5" aria-hidden />
          Copy link
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={() => void copyText("caption")}>
          <Copy className="h-3.5 w-3.5" aria-hidden />
          Copy caption
        </Button>
        <Button variant="secondary" size="sm" asChild>
          <a href={imageUrl} download>
            <Download className="h-3.5 w-3.5" aria-hidden />
            Download image
          </a>
        </Button>
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
