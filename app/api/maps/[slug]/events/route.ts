import { NextRequest } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { getSessionUser } from "@/lib/auth/admin";
import { viewerCanReadMap } from "@/lib/auth/permissions";
import { formatSseData, type GenerationTraceEvent } from "@/lib/generation-stream";
import {
  MAP_TOPIC,
  subscribe as subscribeToBus,
  type MapEvent,
} from "@/lib/server-event-bus";
import { getMapBySlug, getMapRevisionState } from "@/lib/store";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Per-map SSE stream.
 *
 * Push-first: subscribes to the in-process event bus and forwards typed
 * incremental events (`cell_visualization`, `status_change`,
 * `snapshot_revision`) the moment a writer publishes them.
 *
 * Safety net: a slow Postgres poll (every 5s) reconciles dropped bus
 * messages — primarily for cross-instance deployments where the writer
 * runs in a different Node process than this stream.
 *
 * Liveness: a `: keepalive` comment frame every 20s keeps the connection
 * open through proxy idle timeouts. The route stays open until the client
 * disconnects; `complete` is informational, not terminal.
 */

const SAFETY_POLL_MS = 5_000;
const KEEPALIVE_MS = 20_000;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  const initial = await getMapBySlug(slug);
  if (!initial) {
    return new Response("Not found", { status: 404 });
  }

  const user = await getSessionUser();
  if (!viewerCanReadMap(initial, user)) {
    return new Response("Not found", { status: 404 });
  }

  const enc = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      let lastRevision = -1;
      let lastStatus: "generating" | "published" | "failed" | null = null;

      const enqueue = (frame: string) => {
        if (closed) return;
        try {
          controller.enqueue(enc.encode(frame));
        } catch {
          closed = true;
        }
      };

      const send = (event: GenerationTraceEvent) => {
        enqueue(formatSseData(event));
      };

      const sendKeepalive = () => {
        enqueue(": keepalive\n\n");
      };

      const liveStatusFrom = (raw: string): "generating" | "published" | "failed" =>
        raw === "generating" ? "generating" : raw === "failed" ? "failed" : "published";

      // Initial hydrate so the client has a full document to merge into.
      send({
        type: "snapshot",
        revision: initial.revision ?? 0,
        status: liveStatusFrom(initial.status),
        document: initial.document,
      });
      lastRevision = initial.revision ?? 0;
      lastStatus = liveStatusFrom(initial.status);

      // Push path: forward typed bus events as incremental SSE frames.
      const unsubscribe = subscribeToBus<MapEvent>(MAP_TOPIC(slug), (event) => {
        if (closed) return;
        switch (event.kind) {
          case "cell_visualization":
            send({
              type: "cell_visualization",
              revision: event.revision,
              cellId: event.cellId,
              visualization: event.visualization,
            });
            lastRevision = Math.max(lastRevision, event.revision);
            return;
          case "status_change":
            send({
              type: "status_change",
              revision: event.revision,
              status: event.status === "generating" ? "generating" : event.status === "failed" ? "failed" : "published",
            });
            lastRevision = Math.max(lastRevision, event.revision);
            lastStatus = event.status === "generating" ? "generating" : event.status === "failed" ? "failed" : "published";
            return;
          case "snapshot_revision":
            // Structural change without a cheap diff: re-fetch and re-emit.
            void emitFreshSnapshot();
            return;
          case "complete":
            send({ type: "complete", slug: event.slug, title: initial.title });
            return;
          case "failed":
            send({ type: "failed", message: event.message });
            return;
        }
      });

      const emitFreshSnapshot = async () => {
        if (closed) return;
        const fresh = await getMapBySlug(slug).catch((err) => {
          console.error(`[events/${slug}] snapshot fetch failed:`, err);
          return null;
        });
        if (!fresh || closed) return;
        const status = liveStatusFrom(fresh.status);
        send({
          type: "snapshot",
          revision: fresh.revision ?? 0,
          status,
          document: fresh.document,
        });
        lastRevision = Math.max(lastRevision, fresh.revision ?? 0);
        lastStatus = status;
      };

      // Safety-net poll: catches events from other Node instances.
      const safetyTimer = setInterval(async () => {
        if (closed) return;
        try {
          const meta = await getMapRevisionState(slug);
          if (!meta) {
            send({ type: "failed", message: "Map disappeared." });
            cleanup();
            return;
          }
          const status = liveStatusFrom(meta.status);
          if (meta.revision !== lastRevision) {
            await emitFreshSnapshot();
          } else if (status !== lastStatus) {
            send({ type: "status_change", revision: meta.revision, status });
            lastStatus = status;
          }
        } catch (err) {
          Sentry.captureException(err, { tags: { route: "maps-events", slug } });
          console.error(`[events/${slug}] safety poll failed:`, err);
        }
      }, SAFETY_POLL_MS);

      const keepaliveTimer = setInterval(sendKeepalive, KEEPALIVE_MS);

      const cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(safetyTimer);
        clearInterval(keepaliveTimer);
        unsubscribe();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      request.signal.addEventListener("abort", cleanup, { once: true });
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
