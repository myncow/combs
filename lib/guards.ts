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
