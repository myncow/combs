"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";

export function AdminOwnerCell({ ownerId }: { ownerId?: string | null }) {
  const [copied, setCopied] = useState(false);
  const label = ownerId ? `${ownerId.slice(0, 10)}...` : "Legacy (no owner)";

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(timer);
  }, [copied]);

  if (!ownerId) {
    return <span title="Unknown owner">{label}</span>;
  }

  async function copyOwner() {
    if (!ownerId) return;
    try {
      await navigator.clipboard.writeText(ownerId);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button
      type="button"
      onClick={copyOwner}
      title={copied ? "Copied owner id" : ownerId}
      aria-label={copied ? "Copied owner id" : "Copy owner id"}
      className="inline-flex max-w-[12rem] items-center gap-1.5 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="truncate">{label}</span>
      {copied ? (
        <Check className="h-3 w-3 shrink-0 text-primary" aria-hidden />
      ) : (
        <Copy className="h-3 w-3 shrink-0" aria-hidden />
      )}
    </button>
  );
}
