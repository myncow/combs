import { NextRequest } from "next/server";
import { formatSseData, type GenerationTraceEvent } from "@/lib/generation-stream";
import { checkRateLimit, getRequesterId, moderateText } from "@/lib/guards";
import { mapBriefSchema } from "@/lib/schema";
import { runMapGenerationCore } from "@/lib/map-generation-runner";

export const runtime = "nodejs";
export const maxDuration = 300;

function sseResponse(stream: ReadableStream<Uint8Array>) {
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

export async function POST(req: NextRequest) {
  const requesterId = await getRequesterId();
  const rateLimit = checkRateLimit(requesterId);
  if (!rateLimit.allowed) {
    return new Response(
      formatSseData({
        type: "error",
        message: "You have reached the current generation limit. Please try again shortly.",
      }),
      { status: 429, headers: { "Content-Type": "text/event-stream" } },
    );
  }

  const payload = await req.json().catch(() => null);
  const parsed = mapBriefSchema.safeParse(payload);

  if (!parsed.success) {
    return new Response(
      formatSseData({
        type: "error",
        message: parsed.error.issues[0]?.message ?? "Invalid generation brief.",
      }),
      { status: 400, headers: { "Content-Type": "text/event-stream" } },
    );
  }

  const moderated = moderateText(`${parsed.data.topic} ${parsed.data.extraContext ?? ""}`);
  if (!moderated.safe) {
    return new Response(
      formatSseData({
        type: "error",
        message: moderated.reason ?? "This prompt is blocked by moderation.",
      }),
      { status: 400, headers: { "Content-Type": "text/event-stream" } },
    );
  }

  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const push = (event: GenerationTraceEvent) => controller.enqueue(enc.encode(formatSseData(event)));

      try {
        const outcome = await runMapGenerationCore(parsed.data, { sink: push });

        if (outcome.outcome === "rejected") {
          push({
            type: "error",
            message: outcome.normalizedBrief.guidance?.join(" ") ?? "Brief was rejected.",
          });
          return;
        }

        if (outcome.outcome === "failed_publish") {
          push({
            type: "error",
            message:
              outcome.result.error ??
              "The generated map did not meet structural publish requirements.",
          });
          return;
        }

        if (outcome.outcome === "error") {
          push({
            type: "error",
            message: outcome.message,
          });
          return;
        }

        push({
          type: "complete",
          slug: outcome.slug,
          title: outcome.title,
        });
      } catch (error) {
        push({
          type: "error",
          message: error instanceof Error ? error.message : "Generation failed.",
        });
      } finally {
        controller.close();
      }
    },
  });

  return sseResponse(stream);
}
