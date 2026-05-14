import { NextResponse } from "next/server";
import { runJanitor } from "@/lib/janitor";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Vercel cron entry point. Scheduled in vercel.json; Vercel injects the
 * `Authorization: Bearer <CRON_SECRET>` header on every invocation (see
 * https://vercel.com/docs/cron-jobs/manage-cron-jobs#secure-cron-jobs).
 *
 * Manual triggers from anywhere else must supply the same secret.
 */
export async function GET(request: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json(
      { error: "CRON_SECRET is not configured." },
      { status: 500 },
    );
  }
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const url = new URL(request.url);
  const dryRun = url.searchParams.get("dryRun") === "1";

  try {
    const report = await runJanitor({ dryRun });
    return NextResponse.json({ ok: true, dryRun, report });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Janitor run failed.";
    console.error("[cron/janitor] failed:", error);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
