import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AdminOwnerCell } from "@/components/admin-owner-cell";
import { DeleteMapButton } from "@/components/delete-map-button";
import { MapVisibilityControl } from "@/components/map-visibility-control";
import { PageHeader, ShellPage, SurfacePanel } from "@/components/raster-shell";
import { RefillReferencesButton } from "@/components/refill-references-button";
import { Button } from "@/components/ui/button";
import { getSessionUser } from "@/lib/auth/admin";
import { listMaps } from "@/lib/store";
import type { MapVisibility } from "@/lib/types";
import { simplifyMapDisplayTitle } from "@/lib/utils";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 60;
const STATUS_OPTIONS: Array<{ value: "all" | MapVisibility; label: string }> = [
  { value: "all", label: "All statuses" },
  { value: "published", label: "Published" },
  { value: "generating", label: "Generating" },
  { value: "failed", label: "Failed" },
];

function paramValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

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
  const query = paramValue(params.q).trim().slice(0, 160);
  const owner = paramValue(params.owner).trim().slice(0, 160);
  const statusParam = paramValue(params.status);
  const status = STATUS_OPTIONS.some((option) => option.value === statusParam)
    ? (statusParam as "all" | MapVisibility)
    : "all";
  const visibilityParam = paramValue(params.visibility);
  const visibility =
    visibilityParam === "public" || visibilityParam === "private"
      ? visibilityParam
      : undefined;

  const { items, total } = await listMaps({
    pageSize: PAGE_SIZE,
    page,
    status,
    ownerId: owner || undefined,
    query: query || undefined,
    visibility,
  });

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const baseParams = new URLSearchParams();
  if (query) baseParams.set("q", query);
  if (owner) baseParams.set("owner", owner);
  if (status !== "all") baseParams.set("status", status);
  if (visibility) baseParams.set("visibility", visibility);
  const pageHref = (nextPage: number) => {
    const next = new URLSearchParams(baseParams);
    next.set("page", String(nextPage));
    return `/admin/maps?${next.toString()}`;
  };

  return (
    <ShellPage size="content">
      <PageHeader
        eyebrow={`Admin · ${total} ${total === 1 ? "map" : "maps"}`}
        title="All generated maps"
        intro="Every map across every user. Use this view to audit generations, deletions, and public visibility."
        summary={`Page ${page} of ${pageCount}`}
        titleClassName="text-[26px] md:text-[34px]"
      />
      <div className="mt-6 grid gap-5">
        <SurfacePanel>
          <form action="/admin/maps" className="grid gap-3 lg:grid-cols-[minmax(12rem,1fr)_11rem_10rem_minmax(12rem,0.8fr)_auto] lg:items-end">
            <label className="block">
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                Search
              </span>
              <input
                name="q"
                defaultValue={query}
                autoComplete="off"
                placeholder="Title, topic, slug…"
                className="mt-1 h-9 w-full border-b border-border bg-transparent text-[16px] text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:text-[14px]"
              />
            </label>
            <label className="block">
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                Status
              </span>
              <select
                name="status"
                defaultValue={status}
                className="mt-1 h-9 w-full border-b border-border bg-transparent font-mono text-[16px] uppercase tracking-[0.14em] text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:text-[12px]"
              >
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                Visibility
              </span>
              <select
                name="visibility"
                defaultValue={visibility ?? ""}
                className="mt-1 h-9 w-full border-b border-border bg-transparent font-mono text-[16px] uppercase tracking-[0.14em] text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:text-[12px]"
              >
                <option value="">All</option>
                <option value="public">Public</option>
                <option value="private">Private</option>
              </select>
            </label>
            <label className="block">
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                Owner
              </span>
              <input
                name="owner"
                defaultValue={owner}
                autoComplete="off"
                spellCheck={false}
                placeholder="Neon user id…"
                className="mt-1 h-9 w-full border-b border-border bg-transparent font-mono text-[16px] text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:text-[12px]"
              />
            </label>
            <div className="flex gap-2">
              <Button type="submit" size="sm">
                Filter
              </Button>
              <Button asChild variant="secondary" size="sm">
                <Link href="/admin/maps">Reset</Link>
              </Button>
            </div>
          </form>
        </SurfacePanel>
        <SurfacePanel>
          {items.length === 0 ? (
            <p className="px-3 py-6 text-center font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
              No maps in the database yet.
            </p>
          ) : (
            <>
              {/* Mobile card layout — below md, the wide admin table would
                  force a 980px horizontal scroll. */}
              <ul className="grid gap-3 md:hidden">
                {items.map((map) => (
                  <li
                    key={map.id}
                    className="border border-border bg-card p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <Link
                        href={`/maps/${map.slug}`}
                        className="min-w-0 flex-1 font-semibold text-foreground underline-offset-4 hover:underline"
                      >
                        <span className="block truncate">
                          {simplifyMapDisplayTitle(map.title, map.topicFamily)}
                        </span>
                      </Link>
                      <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                        {map.status}
                      </span>
                    </div>
                    <p className="mt-1 break-all font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                      {map.topicFamily || "—"} · {map.slug}
                    </p>
                    <dl className="mt-3 grid grid-cols-2 gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                      <div>
                        <dt className="opacity-70">Owner</dt>
                        <dd className="mt-0.5 normal-case tracking-normal text-foreground">
                          <AdminOwnerCell ownerId={map.createdByNeonUserId} />
                        </dd>
                      </div>
                      <div>
                        <dt className="opacity-70">Visibility</dt>
                        <dd className="mt-0.5">
                          <MapVisibilityControl
                            slug={map.slug}
                            initialIsPublic={Boolean(map.isPublic)}
                            canMutate
                            viewerLabel={
                              map.createdByNeonUserId !== user.id
                                ? "Admin override"
                                : undefined
                            }
                          />
                        </dd>
                      </div>
                      <div>
                        <dt className="opacity-70">Created</dt>
                        <dd className="mt-0.5 tabular-nums normal-case tracking-normal text-foreground">
                          {formatDate(map.createdAt)}
                        </dd>
                      </div>
                      <div>
                        <dt className="opacity-70">Updated</dt>
                        <dd className="mt-0.5 tabular-nums normal-case tracking-normal text-foreground">
                          {formatDate(map.updatedAt)}
                        </dd>
                      </div>
                    </dl>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Button asChild variant="secondary" size="sm">
                        <Link href={`/maps/${map.slug}`}>Inspect</Link>
                      </Button>
                      <RefillReferencesButton slug={map.slug} />
                      <DeleteMapButton
                        slug={map.slug}
                        title={map.title}
                        variant="icon"
                        redirectTo={`/admin/maps${baseParams.toString() ? `?${baseParams.toString()}` : ""}`}
                      />
                    </div>
                  </li>
                ))}
              </ul>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[980px] border-collapse text-left text-[13px]">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground">
                      <th className="px-3 py-2 font-mono text-[10px] uppercase tracking-[0.2em]">Title</th>
                      <th className="px-3 py-2 font-mono text-[10px] uppercase tracking-[0.2em]">Status</th>
                      <th className="px-3 py-2 font-mono text-[10px] uppercase tracking-[0.2em]">Visibility</th>
                      <th className="px-3 py-2 font-mono text-[10px] uppercase tracking-[0.2em]">Owner</th>
                      <th className="px-3 py-2 font-mono text-[10px] uppercase tracking-[0.2em]">Created</th>
                      <th className="px-3 py-2 font-mono text-[10px] uppercase tracking-[0.2em]">Updated</th>
                      <th className="px-3 py-2 font-mono text-[10px] uppercase tracking-[0.2em]">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((map) => (
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
                        <td className="px-3 py-2.5">
                          <MapVisibilityControl
                            slug={map.slug}
                            initialIsPublic={Boolean(map.isPublic)}
                            canMutate
                            viewerLabel={
                              map.createdByNeonUserId !== user.id ? "Admin override" : undefined
                            }
                          />
                        </td>
                        <td className="px-3 py-2.5 font-mono text-[11px] text-muted-foreground">
                          <AdminOwnerCell ownerId={map.createdByNeonUserId} />
                        </td>
                        <td className="px-3 py-2.5 font-mono text-[11px] tabular-nums text-muted-foreground">
                          {formatDate(map.createdAt)}
                        </td>
                        <td className="px-3 py-2.5 font-mono text-[11px] tabular-nums text-muted-foreground">
                          {formatDate(map.updatedAt)}
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <Button asChild variant="secondary" size="sm">
                              <Link href={`/maps/${map.slug}`}>Inspect</Link>
                            </Button>
                            <RefillReferencesButton slug={map.slug} />
                            <DeleteMapButton
                              slug={map.slug}
                              title={map.title}
                              variant="icon"
                              redirectTo={`/admin/maps${baseParams.toString() ? `?${baseParams.toString()}` : ""}`}
                            />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </SurfacePanel>

        {pageCount > 1 ? (
          <nav
            aria-label="Pagination"
            className="flex items-center justify-between font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground"
          >
            {page <= 1 ? (
              <span aria-disabled="true" className="opacity-50">
                ← Prev
              </span>
            ) : (
              <Link href={pageHref(page - 1)} className="hover:text-foreground">
                ← Prev
              </Link>
            )}
            <span>
              Page {page} of {pageCount}
            </span>
            {page >= pageCount ? (
              <span aria-disabled="true" className="opacity-50">
                Next →
              </span>
            ) : (
              <Link href={pageHref(page + 1)} className="hover:text-foreground">
                Next →
              </Link>
            )}
          </nav>
        ) : null}
      </div>
    </ShellPage>
  );
}
