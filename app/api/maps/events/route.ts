import type { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth/admin";
import {
  MAPS_GLOBAL_TOPIC,
  MAPS_USER_TOPIC,
  subscribe as subscribeToBus,
  type MapsListEvent,
} from "@/lib/server-event-bus";
import { listMaps } from "@/lib/store";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Global maps SSE stream that drives the explorer sidebar's live state.
 *
 * Auth-aware: signed-in viewers subscribe to `maps:user:<id>` to see their
 * own library plus the global public stream; signed-out viewers subscribe
 * to `maps:global` only.
 *
 * Wire shape:
 *  - `{ type: "map_status", slug, status, updatedAt, isPublic, ownerId? }`
 *  - `{ type: "map_deleted", slug }`
 *
 * A 5s safety-net poll reconciles bus messages from other Node instances;
 * a `: keepalive` frame every 20s defeats proxy idle timeouts.
 */

const SAFETY_POLL_MS = 5_000;
const KEEPALIVE_MS = 20_000;

type Frame =
  | {
      type: "map_status";
      slug: string;
      status: "generating" | "published" | "failed";
      updatedAt: string;
      isPublic: boolean;
      ownerId: string | null;
    }
  | { type: "map_deleted"; slug: string };

export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  const ownerId = user?.id ?? null;

  const enc = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const enqueue = (frame: string) => {
        if (closed) return;
        try {
          controller.enqueue(enc.encode(frame));
        } catch {
          closed = true;
        }
      };
      const send = (event: Frame) => enqueue(`data: ${JSON.stringify(event)}\n\n`);
      const sendKeepalive = () => enqueue(": keepalive\n\n");

      const visibleToViewer = (event: MapsListEvent): boolean => {
        if (event.kind === "map_deleted") {
          return event.ownerId === null || event.ownerId === ownerId || ownerId === null;
        }
        if (ownerId) {
          return event.isPublic || event.ownerId === ownerId;
        }
        return event.isPublic;
      };

      const handleBusEvent = (event: MapsListEvent) => {
        if (closed || !visibleToViewer(event)) return;
        if (event.kind === "map_status") {
          send({
            type: "map_status",
            slug: event.slug,
            status: event.status === "generating" ? "generating" : event.status === "failed" ? "failed" : "published",
            updatedAt: event.updatedAt,
            isPublic: event.isPublic,
            ownerId: event.ownerId,
          });
        } else {
          send({ type: "map_deleted", slug: event.slug });
        }
      };

      const unsubGlobal = subscribeToBus<MapsListEvent>(MAPS_GLOBAL_TOPIC, handleBusEvent);
      const unsubUser = ownerId
        ? subscribeToBus<MapsListEvent>(MAPS_USER_TOPIC(ownerId), handleBusEvent)
        : () => {};

      // Snapshot of slugs the viewer can currently see; used by the safety
      // poll to detect status flips that the bus missed (cross-instance).
      const lastStatusBySlug = new Map<string, string>();

      const seedSnapshot = async () => {
        try {
          const seed = await listMaps(
            ownerId
              ? {
                  status: "library",
                  page: 1,
                  pageSize: 96,
                  ownerId,
                  includePublic: true,
                }
              : { status: "library", page: 1, pageSize: 96, publicOnly: true },
          );
          for (const item of seed.items) {
            lastStatusBySlug.set(item.slug, item.status);
          }
        } catch (err) {
          console.error("[maps-events] seed snapshot failed:", err);
        }
      };
      await seedSnapshot();

      const safetyTimer = setInterval(async () => {
        if (closed) return;
        try {
          const fresh = await listMaps(
            ownerId
              ? {
                  status: "library",
                  page: 1,
                  pageSize: 96,
                  ownerId,
                  includePublic: true,
                }
              : { status: "library", page: 1, pageSize: 96, publicOnly: true },
          );
          const seen = new Set<string>();
          for (const item of fresh.items) {
            seen.add(item.slug);
            const prev = lastStatusBySlug.get(item.slug);
            if (prev !== item.status) {
              lastStatusBySlug.set(item.slug, item.status);
              send({
                type: "map_status",
                slug: item.slug,
                status: item.status === "generating" ? "generating" : item.status === "failed" ? "failed" : "published",
                updatedAt: item.updatedAt,
                isPublic: Boolean(item.isPublic),
                ownerId: item.createdByNeonUserId ?? null,
              });
            }
          }
          for (const slug of lastStatusBySlug.keys()) {
            if (!seen.has(slug)) {
              lastStatusBySlug.delete(slug);
              send({ type: "map_deleted", slug });
            }
          }
        } catch (err) {
          console.error("[maps-events] safety poll failed:", err);
        }
      }, SAFETY_POLL_MS);

      const keepaliveTimer = setInterval(sendKeepalive, KEEPALIVE_MS);

      const cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(safetyTimer);
        clearInterval(keepaliveTimer);
        unsubGlobal();
        unsubUser();
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
