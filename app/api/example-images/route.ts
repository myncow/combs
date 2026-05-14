import { NextRequest, NextResponse } from "next/server";
import { checkExampleImagesRateLimit, getRequesterId, moderateText } from "@/lib/guards";
import {
  EXAMPLE_IMAGE_QUERY_MAX,
  fetchGoogleImageExampleResults,
  getSerpApiKey,
  normalizeExampleImageQuery,
} from "@/lib/serpapi-images";

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message, results: [] as const }, { status });
}

export async function GET(req: NextRequest) {
  const requesterId = await getRequesterId();
  const rate = await checkExampleImagesRateLimit(`example-images:${requesterId}`);
  if (!rate.allowed) {
    return jsonError("Too many image lookups. Please try again shortly.", 429);
  }

  const rawQ = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  const q = normalizeExampleImageQuery(rawQ);
  if (!q) {
    return jsonError(`Query must be between 2 and ${EXAMPLE_IMAGE_QUERY_MAX} characters.`, 400);
  }

  const moderated = moderateText(q);
  if (!moderated.safe) {
    return jsonError(moderated.reason ?? "Query blocked.", 400);
  }

  if (!getSerpApiKey()) {
    return jsonError("Example image search is not configured (missing SERPAPI_API_KEY).", 503);
  }

  const { results, upstreamError } = await fetchGoogleImageExampleResults(q);
  if (upstreamError === "not_configured") {
    return jsonError("Example image search is not configured (missing SERPAPI_API_KEY).", 503);
  }
  if (upstreamError) {
    return jsonError("Image search temporarily unavailable.", 502);
  }

  return NextResponse.json({ results });
}

export async function POST(req: NextRequest) {
  const requesterId = await getRequesterId();
  const rate = await checkExampleImagesRateLimit(`example-images:${requesterId}`);
  if (!rate.allowed) {
    return jsonError("Too many image lookups. Please try again shortly.", 429);
  }

  const body = await req.json().catch(() => null);
  const rawQ = typeof body?.query === "string" ? body.query : "";
  const q = normalizeExampleImageQuery(rawQ);
  if (!q) {
    return jsonError(`Query must be between 2 and ${EXAMPLE_IMAGE_QUERY_MAX} characters.`, 400);
  }

  const moderated = moderateText(q);
  if (!moderated.safe) {
    return jsonError(moderated.reason ?? "Query blocked.", 400);
  }

  if (!getSerpApiKey()) {
    return jsonError("Example image search is not configured (missing SERPAPI_API_KEY).", 503);
  }

  const { results, upstreamError } = await fetchGoogleImageExampleResults(q);
  if (upstreamError === "not_configured") {
    return jsonError("Example image search is not configured (missing SERPAPI_API_KEY).", 503);
  }
  if (upstreamError) {
    return jsonError("Image search temporarily unavailable.", 502);
  }

  return NextResponse.json({ results });
}
