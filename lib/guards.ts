import { headers } from "next/headers";
import { sql } from "drizzle-orm";
import { appConfig } from "@/lib/config";
import { getDb } from "@/lib/db/client";

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

type RateLimitResult = { allowed: boolean; remaining: number };

/**
 * Atomic, durable per-window rate limit backed by `rate_limit_buckets`.
 *
 * window_start_ms = floor(now / windowMs) * windowMs — the bucket rolls every
 * `windowMs`. INSERT … ON CONFLICT DO UPDATE returns the post-increment count
 * in a single round-trip. The row is "allowed" iff the returned count <= max.
 *
 * Old rows are cleaned by the janitor or a TTL job; their presence doesn't
 * affect correctness because identity+window_start_ms is the primary key.
 */
async function consumeBucket(
  identifier: string,
  windowMs: number,
  maxRequests: number,
): Promise<RateLimitResult> {
  const db = getDb();
  const windowStartMs = Math.floor(Date.now() / windowMs) * windowMs;
  const rows = (await db.execute(sql`
    INSERT INTO rate_limit_buckets (identifier, window_start_ms, count)
    VALUES (${identifier}, ${windowStartMs}, 1)
    ON CONFLICT (identifier, window_start_ms)
    DO UPDATE SET count = rate_limit_buckets.count + 1
    RETURNING count
  `)) as unknown as Array<{ count: number }>;
  const count = rows[0]?.count ?? 1;
  if (count > maxRequests) {
    return { allowed: false, remaining: 0 };
  }
  return { allowed: true, remaining: Math.max(0, maxRequests - count) };
}

export async function checkExampleImagesRateLimit(
  identifier: string,
): Promise<RateLimitResult> {
  return consumeBucket(
    `ex:${identifier}`,
    appConfig.exampleImagesRateLimit.windowMs,
    appConfig.exampleImagesRateLimit.maxRequests,
  );
}

export async function checkRateLimit(identifier: string): Promise<RateLimitResult> {
  return consumeBucket(
    `gen:${identifier}`,
    appConfig.rateLimit.windowMs,
    appConfig.rateLimit.maxRequests,
  );
}

export function moderateText(value: string) {
  const lowered = value.toLowerCase();
  const hit = appConfig.moderation.bannedTerms.find((term) => lowered.includes(term));
  return {
    safe: !hit,
    reason: hit ? `Blocked for unsafe topic: ${hit}` : undefined,
  };
}
