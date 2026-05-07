import { NextRequest, NextResponse } from "next/server";
import { suggestAxisPairs } from "@/lib/map-engine";
import { checkRateLimit, getRequesterId, moderateText } from "@/lib/guards";
import { auth } from "@/lib/auth/server";
import { mapBriefSchema, suggestAxisPairsRequestSchema } from "@/lib/schema";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const { data: session } = await auth.getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Sign in to unlock axis suggestions." }, { status: 401 });
  }

  const requesterId = session.user.id || (await getRequesterId());
  const rateLimit = checkRateLimit(`suggest-axis-pairs:${requesterId}`);
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Rate limit exceeded. Try again shortly." }, { status: 429 });
  }

  const raw = await req.json().catch(() => null);
  const parsedReq = suggestAxisPairsRequestSchema.safeParse(raw);
  if (!parsedReq.success) {
    return NextResponse.json(
      { error: parsedReq.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 },
    );
  }

  const { topic, chips = [], constraints: rawConstraints } = parsedReq.data;
  const constraints = rawConstraints?.trim() ? rawConstraints.trim().slice(0, 400) : undefined;

  const moderated = moderateText(`${topic} ${chips.join(" ")} ${constraints ?? ""}`);
  if (!moderated.safe) {
    return NextResponse.json({ error: moderated.reason ?? "Blocked by moderation." }, { status: 400 });
  }

  const combines = chips.slice(0, 8).join(" · ").slice(0, 180);
  const candidateDimensions = chips
    .map((c) => c.trim())
    .filter((c) => c.length >= 2)
    .slice(0, 4);

  const briefInput = mapBriefSchema.parse({
    topic,
    combines,
    candidateDimensions,
    inferDimensions: true,
    ...(constraints ? { constraints } : {}),
  });

  try {
    const { pairs } = await suggestAxisPairs(briefInput, { signal: req.signal });
    return NextResponse.json({ pairs });
  } catch (e) {
    if (req.signal.aborted) {
      return NextResponse.json({ error: "Request cancelled." }, { status: 499 });
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Suggestion failed." },
      { status: 502 },
    );
  }
}
