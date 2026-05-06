import { NextRequest } from "next/server";
import { formatSseData, type GenerationTraceEvent } from "@/lib/generation-stream";
import { getMapBySlug, getMapRevisionState } from "@/lib/store";

export const runtime = "nodejs";
export const maxDuration = 300;

const POLL_INTERVAL_MS = 600;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  const initial = await getMapBySlug(slug);
  if (!initial) {
    return new Response("Not found", { status: 404 });
  }

  const enc = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let lastRevision = -1;
      let closed = false;

      const send = (event: GenerationTraceEvent) => {
        if (closed) return;
        try {
          controller.enqueue(enc.encode(formatSseData(event)));
        } catch {
          closed = true;
        }
      };

      const sendSnapshot = async (force = false) => {
        const meta = await getMapRevisionState(slug);
        if (!meta) {
          send({ type: "failed", message: "Map disappeared." });
          return "stop" as const;
        }
        if (force || meta.revision !== lastRevision) {
          const map = await getMapBySlug(slug);
          if (map) {
            const liveStatus =
              meta.status === "generating"
                ? "generating"
                : meta.status === "failed"
                  ? "failed"
                  : "published";
            send({
              type: "snapshot",
              revision: meta.revision,
              status: liveStatus,
              document: map.document,
            });
            lastRevision = meta.revision;
          }
        }
        if (meta.status === "published") {
          send({ type: "complete", slug, title: initial.title });
          return "stop" as const;
        }
        if (meta.status === "failed") {
          send({ type: "failed", message: initial.summary || "Generation failed." });
          return "stop" as const;
        }
        return "continue" as const;
      };

      // Send an initial snapshot immediately so the client hydrates.
      const firstResult = await sendSnapshot(true);
      if (firstResult === "stop") {
        closed = true;
        try {
          controller.close();
        } catch {
          /* already closed */
        }
        return;
      }

      const onAbort = () => {
        closed = true;
      };
      request.signal.addEventListener("abort", onAbort, { once: true });

      while (!closed && !request.signal.aborted) {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
        if (closed || request.signal.aborted) break;
        const result = await sendSnapshot(false).catch((err) => {
          console.error(`[events/${slug}] poll failed:`, err);
          return "continue" as const;
        });
        if (result === "stop") break;
      }

      closed = true;
      try {
        controller.close();
      } catch {
        /* already closed */
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
