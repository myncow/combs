import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { checkRateLimit, getRequesterId, moderateText } from "@/lib/guards";
import { runMapGenerationCore } from "@/lib/map-generation-runner";
import { mapBriefSchema } from "@/lib/schema";
import { reserveMap } from "@/lib/store";
import type { MapBrief } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const requesterId = await getRequesterId();
  const rateLimit = checkRateLimit(requesterId);
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

  const reserved = await reserveMap({ brief: parsed.data as MapBrief });

  // Run generation after the response ships. The map row is already in the DB
  // with status="generating"; the live SSE stream picks up the slug and
  // streams progress until status flips to "published" or "failed".
  after(async () => {
    try {
      await runMapGenerationCore(parsed.data, { reservedMap: reserved });
    } catch (error) {
      console.error(`[generate/start] background run for ${reserved.slug} threw:`, error);
    }
  });

  return NextResponse.json({ slug: reserved.slug, id: reserved.id });
}
