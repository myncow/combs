import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PageHeader, ShellPage, SurfacePanel } from "@/components/raster-shell";
import { getSessionUser } from "@/lib/auth/admin";
import { listMaps } from "@/lib/store";
import { simplifyMapDisplayTitle } from "@/lib/utils";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 60;

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

export default async function AdminMapsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getSessionUser();
  if (!user) {
    redirect("/auth/sign-in?redirectTo=/admin/maps");
  }
  if (!user.isAdmin) {
    notFound();
  }

  const params = await searchParams;
  const pageParam = typeof params.page === "string" ? Number.parseInt(params.page, 10) : 1;
  const page = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1;

  const { items, total } = await listMaps({
    pageSize: PAGE_SIZE,
    page,
    status: "library",
  });

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <ShellPage size="content">
      <PageHeader
        eyebrow={`Admin · ${total === 1 ? "01 map" : `${String(total).padStart(2, "0")} maps`}`}
        title="All generated maps"
        intro="Every map across every user. Use this view to audit generations, deletions, and public visibility."
        summary={`Page ${page} of ${pageCount}`}
        titleClassName="text-[26px] md:text-[34px]"
      />
      <div className="mt-6 grid gap-5">
        <SurfacePanel>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-left text-[13px]">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="px-3 py-2 font-mono text-[10px] uppercase tracking-[0.2em]">Title</th>
                  <th className="px-3 py-2 font-mono text-[10px] uppercase tracking-[0.2em]">Status</th>
                  <th className="px-3 py-2 font-mono text-[10px] uppercase tracking-[0.2em]">Visibility</th>
                  <th className="px-3 py-2 font-mono text-[10px] uppercase tracking-[0.2em]">Owner</th>
                  <th className="px-3 py-2 font-mono text-[10px] uppercase tracking-[0.2em]">Created</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-3 py-6 text-center font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground"
                    >
                      No maps in the database yet.
                    </td>
                  </tr>
                ) : (
                  items.map((map) => (
                    <tr key={map.id} className="border-b border-border/60 hover:bg-foreground/[0.03]">
                      <td className="px-3 py-2.5">
                        <Link
                          href={`/maps/${map.slug}`}
                          className="font-semibold text-foreground underline-offset-4 hover:underline"
                        >
                          {simplifyMapDisplayTitle(map.title, map.topicFamily)}
                        </Link>
                        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                          {map.topicFamily || "—"} · {map.slug}
                        </p>
                      </td>
                      <td className="px-3 py-2.5 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                        {map.status}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-[11px] uppercase tracking-[0.18em]">
                        <span
                          className={
                            map.isPublic
                              ? "text-primary"
                              : "text-muted-foreground"
                          }
                        >
                          {map.isPublic ? "Public" : "Private"}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 font-mono text-[11px] text-muted-foreground">
                        <span title={map.createdByNeonUserId ?? "Unknown owner"}>
                          {map.createdByNeonUserId
                            ? `${map.createdByNeonUserId.slice(0, 10)}…`
                            : "Legacy (no owner)"}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 font-mono text-[11px] tabular-nums text-muted-foreground">
                        {formatDate(map.createdAt)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </SurfacePanel>

        {pageCount > 1 ? (
          <nav
            aria-label="Pagination"
            className="flex items-center justify-between font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground"
          >
            <Link
              href={`/admin/maps?page=${Math.max(1, page - 1)}`}
              aria-disabled={page <= 1}
              className={
                page <= 1
                  ? "pointer-events-none opacity-50"
                  : "hover:text-foreground"
              }
            >
              ← Prev
            </Link>
            <span>
              Page {page} of {pageCount}
            </span>
            <Link
              href={`/admin/maps?page=${Math.min(pageCount, page + 1)}`}
              aria-disabled={page >= pageCount}
              className={
                page >= pageCount
                  ? "pointer-events-none opacity-50"
                  : "hover:text-foreground"
              }
            >
              Next →
            </Link>
          </nav>
        ) : null}
      </div>
    </ShellPage>
  );
}
