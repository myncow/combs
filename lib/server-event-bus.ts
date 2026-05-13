/**
 * In-process pub/sub used by SSE routes. Mutation sites (server actions and
 * the map runner) publish typed events; SSE routes subscribe to topics and
 * forward the events to connected clients.
 *
 * Scope: a single Node.js process. SSE routes layer a slow Postgres poll on
 * top so cross-instance deployments stay consistent — the bus is the fast
 * path, the poll is the safety net.
 *
 * Singleton via globalThis so dev-server HMR doesn't fragment subscribers.
 */

import type { MapCellVisualization, MapVisibility } from "@/lib/types";

export type MapEvent =
  /** Generic revision bump from `applyMapPatch`. SSE routes hydrate fresh. */
  | { kind: "snapshot_revision"; slug: string; revision: number }
  /** A single cell's visualization landed (image + caption). */
  | {
      kind: "cell_visualization";
      slug: string;
      cellId: string;
      revision: number;
      visualization: MapCellVisualization;
    }
  /** Status transitioned (generating -> published / failed). */
  | { kind: "status_change"; slug: string; status: MapVisibility; revision: number }
  /** Generation pipeline finished (published + post-publish enrichment). */
  | { kind: "complete"; slug: string }
  /** Generation pipeline failed. */
  | { kind: "failed"; slug: string; message: string };

export type MapsListEvent =
  | {
      kind: "map_status";
      slug: string;
      status: MapVisibility;
      updatedAt: string;
      ownerId: string | null;
      isPublic: boolean;
    }
  | { kind: "map_deleted"; slug: string; ownerId: string | null };

export const MAP_TOPIC = (slug: string): string => `map:${slug}`;
export const MAPS_GLOBAL_TOPIC = "maps:global" as const;
export const MAPS_USER_TOPIC = (userId: string): string => `maps:user:${userId}`;

type Handler = (payload: unknown) => void;

type Bus = {
  topics: Map<string, Set<Handler>>;
};

declare global {
  // eslint-disable-next-line no-var
  var __rasterEventBus__: Bus | undefined;
}

function getBus(): Bus {
  if (!globalThis.__rasterEventBus__) {
    globalThis.__rasterEventBus__ = { topics: new Map() };
  }
  return globalThis.__rasterEventBus__;
}

/**
 * Publish a typed event to a topic. Handler errors are isolated so one
 * faulty subscriber cannot break the loop for others.
 */
export function publish<T>(topic: string, payload: T): void {
  const bus = getBus();
  const handlers = bus.topics.get(topic);
  if (!handlers || handlers.size === 0) return;
  for (const handler of handlers) {
    try {
      handler(payload);
    } catch (err) {
      console.error(`[event-bus] handler for "${topic}" threw:`, err);
    }
  }
}

/**
 * Subscribe to a topic. Returns a disposer; always call it when the
 * consumer unmounts (e.g. on `request.signal` abort) to avoid leaks.
 */
export function subscribe<T>(topic: string, handler: (payload: T) => void): () => void {
  const bus = getBus();
  let handlers = bus.topics.get(topic);
  if (!handlers) {
    handlers = new Set();
    bus.topics.set(topic, handlers);
  }
  const wrapped: Handler = handler as Handler;
  handlers.add(wrapped);
  return () => {
    const set = bus.topics.get(topic);
    if (!set) return;
    set.delete(wrapped);
    if (set.size === 0) bus.topics.delete(topic);
  };
}

/** Test helper: number of subscribers across a topic. */
export function subscriberCount(topic: string): number {
  return getBus().topics.get(topic)?.size ?? 0;
}

/** Test helper: drop every subscription (used in vitest setup). */
export function resetEventBus(): void {
  getBus().topics.clear();
}
