import { NextRequest, NextResponse } from "next/server";
import { mapBriefSchema } from "@/lib/schema";
import { checkRateLimit, getRequesterId, moderateText } from "@/lib/guards";
import { auth } from "@/lib/auth/server";
import { runMapGenerationCore } from "@/lib/map-generation-runner";

export async function POST(req: NextRequest) {
  const { data: session } = await auth.getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Sign in to build maps." }, { status: 401 });
  }

  const requesterId = session.user.id || (await getRequesterId());
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

  const outcome = await runMapGenerationCore(parsed.data);

  if (outcome.outcome === "success") {
    return NextResponse.json({ slug: outcome.slug, title: outcome.title });
  }

  if (outcome.outcome === "rejected") {
    return NextResponse.json(
      { error: "rejected", guidance: outcome.normalizedBrief.guidance },
      { status: 400 },
    );
  }

  if (outcome.outcome === "failed_publish") {
    return NextResponse.json(
      { error: outcome.result.error ?? "failed", guidance: outcome.result.guidance },
      { status: 400 },
    );
  }

  return NextResponse.json({ error: outcome.message ?? "Generation failed." }, { status: 500 });
}
