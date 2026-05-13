import { headers } from "next/headers";
import { appConfig } from "@/lib/config";

type CounterEntry = {
  count: number;
  windowStart: number;
};

const globalForRateLimit = globalThis as typeof globalThis & {
  __mapStudioRateLimit?: Map<string, CounterEntry>;
  __exampleImagesRateLimit?: Map<string, CounterEntry>;
};

function getStore() {
  if (!globalForRateLimit.__mapStudioRateLimit) {
    globalForRateLimit.__mapStudioRateLimit = new Map();
  }

  return globalForRateLimit.__mapStudioRateLimit;
}

function getExampleImagesStore() {
  if (!globalForRateLimit.__exampleImagesRateLimit) {
    globalForRateLimit.__exampleImagesRateLimit = new Map();
  }

  return globalForRateLimit.__exampleImagesRateLimit;
}

export async function getRequesterId() {
  const requestHeaders = await headers();
  return (
    requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    requestHeaders.get("x-real-ip") ??
    "local-dev"
  );
}

/**
 * Identity used to scope a viewer's vote / viewerVote read on the leaderboard.
 *
 * For signed-in users we MUST key by `user.id`; otherwise everyone behind the
 * same NAT'd IP shares a vote slot and switching networks (home wifi → mobile
 * data) reads as a brand-new viewer, letting one person stack multiple votes.
 *
 * Signed-out viewers fall back to the request IP — best-effort, but at least
 * stable per network for a single browsing session.
 */
export async function getVoterIdentity(): Promise<string> {
  // Lazy import to keep `lib/guards` from pulling the Neon Auth runtime into
  // tools/tests that only need the IP-based requester id.
  const { getSessionUser } = await import("@/lib/auth/admin");
  const user = await getSessionUser().catch(() => null);
  if (user?.id) {
    return `user:${user.id}`;
  }
  const ip = await getRequesterId();
  return `ip:${ip}`;
}

export function checkExampleImagesRateLimit(identifier: string) {
  const now = Date.now();
  const store = getExampleImagesStore();
  const windowMs = appConfig.exampleImagesRateLimit.windowMs;
  const maxRequests = appConfig.exampleImagesRateLimit.maxRequests;
  const current = store.get(identifier);

  if (!current || now - current.windowStart > windowMs) {
    store.set(identifier, { count: 1, windowStart: now });
    return { allowed: true, remaining: maxRequests - 1 };
  }

  if (current.count >= maxRequests) {
    return { allowed: false, remaining: 0 };
  }

  current.count += 1;
  store.set(identifier, current);
  return {
    allowed: true,
    remaining: maxRequests - current.count,
  };
}

export function checkRateLimit(identifier: string) {
  const now = Date.now();
  const store = getStore();
  const windowMs = appConfig.rateLimit.windowMs;
  const current = store.get(identifier);

  if (!current || now - current.windowStart > windowMs) {
    store.set(identifier, { count: 1, windowStart: now });
    return { allowed: true, remaining: appConfig.rateLimit.maxRequests - 1 };
  }

  if (current.count >= appConfig.rateLimit.maxRequests) {
    return { allowed: false, remaining: 0 };
  }

  current.count += 1;
  store.set(identifier, current);
  return {
    allowed: true,
    remaining: appConfig.rateLimit.maxRequests - current.count,
  };
}

export function moderateText(value: string) {
  const lowered = value.toLowerCase();
  const hit = appConfig.moderation.bannedTerms.find((term) => lowered.includes(term));
  return {
    safe: !hit,
    reason: hit ? `Blocked for unsafe topic: ${hit}` : undefined,
  };
}
