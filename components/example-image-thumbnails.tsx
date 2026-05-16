"use client";

import { ExternalLink } from "lucide-react";
import { cn, googleImagesSearchUrl } from "@/lib/utils";

export type ExampleImageHit = { title?: string; link: string; thumbnail?: string; source?: string };

/** Renders persisted SERP thumbnails only (no fetch). */
export function PersistedReferenceThumbnails({
  images,
  className,
  compact = false,
}: {
  images: ExampleImageHit[];
  className?: string;
  compact?: boolean;
}) {
  const list = images.filter((h) => h.thumbnail && h.link).slice(0, 4);
  if (!list.length) {
    return null;
  }
  return (
    <div
      className={cn(
        "grid gap-1",
        compact ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-4",
        className,
      )}
    >
      {list.map((h) => (
        <a
          key={h.link}
          href={h.link}
          target="_blank"
          rel="noopener noreferrer"
          className="relative aspect-square w-full overflow-hidden border border-border bg-muted outline-none ring-offset-background transition-colors duration-150 hover:border-foreground focus-visible:ring-2 focus-visible:ring-ring"
          title={h.title ?? h.source ?? ""}
        >
          {/* Remote SERP thumb: native img for arbitrary hosts. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={h.thumbnail!} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
        </a>
      ))}
    </div>
  );
}

export function OpenImageSearchLink({
  query,
  className,
}: {
  query: string;
  className?: string;
}) {
  const q = query.trim();
  if (!q.length) {
    return null;
  }
  return (
    <a
      href={googleImagesSearchUrl(q)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Open Google Images for ${q}`}
      className={className}
    >
      Open image search
      <ExternalLink className="ml-1 inline-block h-3 w-3 shrink-0 translate-y-[1px] text-muted-foreground" />
    </a>
  );
}
