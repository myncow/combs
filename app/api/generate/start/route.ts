import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { checkRateLimit, getRequesterId, moderateText } from "@/lib/guards";
import { getAuth } from "@/lib/auth/server";
import { runMapGenerationCore } from "@/lib/map-generation-runner";
import { mapBriefSchema } from "@/lib/schema";
import { reserveMap } from "@/lib/store";
import type { MapBrief } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const { data: session } = await getAuth().getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Sign in to build maps." }, { status: 401 });
  }

  const requesterId = session.user.id || (await getRequesterId());
  const rateLimit = await checkRateLimit(requesterId);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "You have reached the current generation limit. Please try again shortly." },
      { status: 429 },
    );
  }

  const payload = await req.json().catch(() => null);
  const parsed = mapBriefSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid generation brief." },
      { status: 400 },
    );
  }

  const moderated = moderateText(`${parsed.data.topic} ${parsed.data.extraContext ?? ""}`);
  if (!moderated.safe) {
    return NextResponse.json(
      { error: moderated.reason ?? "This prompt is blocked by moderation." },
      { status: 400 },
    );
  }

  const ownerId = session.user.id ?? null;
  const idempotencyKey = req.headers.get("idempotency-key")?.slice(0, 80) ?? null;
  const reserved = await reserveMap({
    brief: parsed.data as MapBrief,
    ownerId,
    idempotencyKey,
  });

  // Run generation after the response ships. The map row is already in the DB
  // with status="generating"; the live SSE stream picks up the slug and
  // streams progress until status flips to "published" or "failed".
  after(async () => {
    try {
      await runMapGenerationCore(parsed.data, { reservedMap: reserved, ownerId });
    } catch (error) {
      console.error(`[generate/start] background run for ${reserved.slug} threw:`, error);
    }
  });

  return NextResponse.json({ slug: reserved.slug, id: reserved.id });
}
