"use client";

/**
 * Map renderer — functional grid of (X × Y) cells with a right-side drawer
 * for detail. Rows never jump; only one cell is active at a time. Each tile
 * keeps the open-detail button separate from direct image/search actions so
 * we avoid invalid button-inside-button markup.
 *
 * Reference thumbnails open the original source (target=_blank, rel=noopener)
 * and layer a `download` anchor. Cross-origin thumbs may ignore `download`;
 * we still set it and pair it with an explicit "Open original" fallback.
 */

import { PersistedReferenceThumbnails, type ExampleImageHit } from "@/components/example-image-thumbnails";
import { GapSpotlightSheet } from "@/components/gap-spotlight-sheet";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { finalizeVisualizationCaption } from "@/lib/visualization-caption";
import { labelForImageModelId } from "@/lib/image-model-options";
import { cn, exampleHasImageQuery, exampleImageSearchQuery, googleImagesSearchUrl } from "@/lib/utils";
import {
  MOTION_DURATION,
  MOTION_EASE,
  entryTransition,
  revealTransition,
} from "@/lib/motion";
import { type MapCell, type MapCellStatus, type MapDocument, type MapExample } from "@/lib/types";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Fragment,
  createContext,
  startTransition,
  useActionState,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowUpRight,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  Expand,
  ImageIcon,
  RefreshCw,
  Sparkles,
  X,
} from "lucide-react";
import { visualizeCellAction, type VisualizeCellActionState } from "@/app/actions";
import { authClient } from "@/lib/auth/client";
import { buildAuthRedirectHref } from "@/lib/auth/redirect";
import { dispatchLibraryRefresh } from "@/lib/client-events";
import { CELL_IMAGE_MODEL } from "@/lib/config";
import { IMAGE_MODEL_CHANGE_EVENT, IMAGE_MODEL_STORAGE_KEY, readStoredImageModel } from "@/lib/model-preference";

/** Expand / copy / download on viz + reference thumbs: theme tokens so light mode keeps contrast on letterboxing. */
const mediaOverlayIconChipClass =
  "inline-flex h-8 w-8 items-center justify-center border border-border-strong bg-background/95 text-foreground shadow-[0_2px_12px_rgba(0,0,0,0.14)] backdrop-blur-md transition-colors duration-150 hover:bg-card hover:border-foreground/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background dark:shadow-[0_2px_16px_rgba(0,0,0,0.45)]";

const mediaOverlayControlSmClass =
  "pointer-events-auto inline-flex h-7 w-7 items-center justify-center border border-border-strong bg-background/95 text-foreground shadow-[0_1px_8px_rgba(0,0,0,0.14)] backdrop-blur-md transition-colors duration-150 hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background dark:shadow-[0_2px_12px_rgba(0,0,0,0.4)]";

const tileQuickActionClass =
  "pointer-events-auto inline-flex h-11 w-11 items-center justify-center border border-border-strong bg-background/92 text-foreground shadow-[0_2px_12px_rgba(0,0,0,0.16)] backdrop-blur-md transition-[background-color,border-color,color,transform,opacity] duration-150 hover:-translate-y-px hover:border-foreground/45 hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:translate-y-0 dark:border-white/18 dark:shadow-[0_2px_16px_rgba(0,0,0,0.42)] md:h-9 md:w-9 xl:h-10 xl:w-10";

/**
 * Icon-only chip used in the no-image empty state. Tinted with the cell's
 * `--status-color` so it reads as part of the tile rather than a separate
 * floating control. Tooltip + aria-label carry the action name.
 */
const tileEmptyActionClass =
  "pointer-events-auto inline-flex h-8 w-8 items-center justify-center border border-[color:color-mix(in_srgb,var(--status-color)_55%,var(--border-strong))] bg-[color:color-mix(in_srgb,var(--status-color)_18%,var(--card))] text-foreground shadow-[0_1px_6px_rgba(0,0,0,0.08)] backdrop-blur-sm transition-[background-color,border-color,color,transform,opacity] duration-150 hover:-translate-y-px hover:bg-[color:color-mix(in_srgb,var(--status-color)_28%,var(--card))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:translate-y-0";

/**
 * Labeled "Sketch" pill used inside an unfilled gap cell. Bigger than the
 * icon-only chip so the invitation reads at a glance.
 */
const sketchPillClass =
  "pointer-events-auto inline-flex items-center gap-1.5 border border-primary/55 bg-[color:color-mix(in_srgb,var(--primary)_14%,var(--card))] px-3 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-foreground shadow-[0_1px_8px_rgba(0,0,0,0.08)] backdrop-blur-sm transition-[background-color,border-color,color,transform,opacity] duration-150 hover:-translate-y-px hover:bg-[color:color-mix(in_srgb,var(--primary)_24%,var(--card))] hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:translate-y-0";

function VizModelOverlay({ modelId, className }: { modelId: string; className?: string }) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute z-[5] max-w-[min(100%,15rem)] border border-border/60 bg-background/85 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground shadow-sm backdrop-blur-sm",
        "bottom-2 left-2",
        className,
      )}
      title={modelId}
    >
      {labelForImageModelId(modelId)}
    </div>
  );
}

/**
 * Each generatable cell mounts a hidden visualize form; the tile and drawer
 * submit the same form via the `form` attribute so there is one action, one
 * pending state.
 */
type VisualizeEntry = {
  state: VisualizeCellActionState;
  formAction: (formData: FormData) => void;
  isPending: boolean;
};

function visualizeStateEqual(a: VisualizeCellActionState, b: VisualizeCellActionState): boolean {
  if (a.status !== b.status) return false;
  if (a.status === "idle" && b.status === "idle") return true;
  if (a.status === "error" && b.status === "error") return a.message === b.message;
  if (a.status === "success" && b.status === "success") {
    return (
      a.result.imageUrl === b.result.imageUrl &&
      a.result.caption === b.result.caption &&
      a.result.imageModel === b.result.imageModel
    );
  }
  return false;
}

function visualizeFormId(cellId: string) {
  return `viz-${cellId}`;
}

const VisualizeRegistryContext = createContext<Record<string, VisualizeEntry>>({});

function useVisualizeCell(cellId: string): VisualizeEntry | undefined {
  return useContext(VisualizeRegistryContext)[cellId];
}

function VisualizeRegistryProvider({
  cells,
  document,
  children,
}: {
  cells: MapCell[];
  document: MapDocument;
  children: React.ReactNode;
}) {
  const [registry, setRegistry] = useState<Record<string, VisualizeEntry>>({});
  const setEntry = useCallback((cellId: string, entry: VisualizeEntry) => {
    setRegistry((prev) => {
      const existing = prev[cellId];
      if (
        existing &&
        visualizeStateEqual(existing.state, entry.state) &&
        existing.isPending === entry.isPending &&
        existing.formAction === entry.formAction
      ) {
        return prev;
      }
      return { ...prev, [cellId]: entry };
    });
  }, []);

  return (
    <VisualizeRegistryContext.Provider value={registry}>
      {cells.map((cell) => (
        <CellVisualizeOwner key={cell.id} cell={cell} document={document} setEntry={setEntry} />
      ))}
      {children}
    </VisualizeRegistryContext.Provider>
  );
}

/**
 * Mounts one `useActionState` plus a hidden form per cell; tile + drawer
 * submit buttons use `form={visualizeFormId(cellId)}`.
 */
function CellVisualizeOwner({
  cell,
  document,
  setEntry,
}: {
  cell: MapCell;
  document: MapDocument;
  setEntry: (cellId: string, entry: VisualizeEntry) => void;
}) {
  const router = useRouter();
  const cellId = cell.id;
  const [imageModel, setImageModel] = useState<string>(() => {
    if (typeof window === "undefined") {
      return CELL_IMAGE_MODEL;
    }
    return readStoredImageModel();
  });
  const [state, formAction, isPending] = useActionState(visualizeCellAction, {
    status: "idle",
  });

  const successImageUrl = state.status === "success" ? state.result.imageUrl : null;

  useEffect(() => {
    if (!successImageUrl) return;
    dispatchLibraryRefresh();
    startTransition(() => {
      router.refresh();
    });
  }, [successImageUrl, router]);

  useEffect(() => {
    const sync = () => setImageModel(readStoredImageModel());
    window.addEventListener(IMAGE_MODEL_CHANGE_EVENT, sync);
    const onStorage = (e: StorageEvent) => {
      if (e.key === IMAGE_MODEL_STORAGE_KEY) sync();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(IMAGE_MODEL_CHANGE_EVENT, sync);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  useEffect(() => {
    setEntry(cellId, { state, formAction, isPending });
  }, [cellId, state, formAction, isPending, setEntry]);

  /* One form per cell: tile overlays + drawer both submit via html `form=`. */
  return (
    <form
      id={visualizeFormId(cellId)}
      action={formAction}
      className="fixed left-[-9999px] top-0 h-px w-px overflow-hidden p-0 opacity-0"
      tabIndex={-1}
      aria-hidden
      noValidate
    >
      <input type="hidden" name="document" value={JSON.stringify(document)} />
      <input type="hidden" name="cell" value={JSON.stringify(cell)} />
      <input type="hidden" name="imageModel" value={imageModel} />
    </form>
  );
}

const TILE_VISUAL_FRAME_CLASS =
  "relative min-h-0 flex-1 overflow-hidden bg-transparent transition-colors duration-150";

/**
 * statusDisplay — single source of truth for how each of the five cell
 * statuses reads visually. Color alone is never enough; every status pairs
 * color with a distinct shape/stroke/pattern so the grid stays legible for
 * color-blind users too.
 *
 *   existing    solid filled square, graphite
 *   rare        open square, hairline stroke only
 *   gap         open square + center accent dot (cobalt)
 *   tension     square with a single diagonal slash
 *   impossible  hatched pattern square (unique texture)
 *
 * Also holds the tile left-bar accent. Status-specific tile/body fills are
 * avoided so adjacent cells read as the same component type.
 */
const statusDisplay: Record<
  MapCellStatus,
  {
    label: string;
    color: string;
    tileLeftBar: string;
  }
> = {
  existing: {
    label: "Existing",
    color: "var(--foreground)",
    tileLeftBar: "before:bg-foreground",
  },
  rare: {
    label: "Rare",
    color: "color-mix(in srgb, var(--foreground) 72%, var(--background))",
    tileLeftBar: "before:bg-foreground/55",
  },
  gap: {
    label: "Gap",
    color: "var(--primary)",
    tileLeftBar: "before:bg-primary",
  },
  tension: {
    label: "Tension",
    color: "color-mix(in srgb, var(--primary) 70%, var(--foreground) 30%)",
    tileLeftBar: "before:bg-primary/85",
  },
  impossible: {
    label: "Impossible",
    color: "var(--destructive)",
    tileLeftBar: "before:bg-destructive",
  },
};

function statusColorStyle(status: MapCellStatus): React.CSSProperties & { "--status-color": string } {
  return { "--status-color": statusDisplay[status].color };
}

function canGenerateVisualization(status: MapCellStatus) {
  return status === "gap" || status === "tension" || status === "impossible";
}

/**
 * Cells whose `label` is not a documented subject name (gap = no documented
 * example; impossible = ruled out). Use the coordinate intersection as the
 * drawer title for these.
 */
function isUnnamedCell(cell: MapCell): boolean {
  return cell.status === "gap" || cell.status === "impossible";
}

function coordinateTitle(yValue?: string, xValue?: string): string {
  const a = (yValue ?? "").trim();
  const b = (xValue ?? "").trim();
  if (a && b) return `${a} × ${b}`;
  return a || b || "Unfilled cell";
}

function cellFirstSearchableQuery(cell: MapCell): string | null {
  for (const example of cell.examples) {
    const q = exampleImageSearchQuery(example);
    if (exampleHasImageQuery(q)) return q;
  }
  return null;
}

function visualizationActionCopy(hasViz: boolean, isPending: boolean) {
  if (hasViz) {
    return {
      actionLabel: "Try another scene",
      pendingLabel: "Trying another scene...",
      buttonLabel: isPending ? "Trying another scene..." : "Try another scene",
    };
  }

  return {
    actionLabel: "Sketch scene",
    pendingLabel: "Sketching scene...",
    buttonLabel: isPending ? "Sketching scene..." : "Sketch scene",
  };
}

function IndeterminateLoadingBar({
  label,
  className,
  barClassName,
  thin,
}: {
  /** Announced to assistive tech */
  label: string;
  className?: string;
  barClassName?: string;
  thin?: boolean;
}) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label={label}
      className={cn("viz-loading-track w-full shrink-0", thin ? "h-1.5" : "h-2", className)}
    >
      <div className={cn("viz-loading-bar", barClassName)} aria-hidden />
    </div>
  );
}

/**
 * StatusMark — a 14–16px square whose shape + stroke + color encode the
 * status. Designed to read at a glance and remain color-blind safe by
 * pairing every color with a distinct shape.
 */
function StatusMark({ status, size = 14 }: { status: MapCellStatus; size?: number }) {
  const dim = { width: size, height: size };
  const base = "inline-block shrink-0";
  const statusColor = statusDisplay[status].color;
  const stroke = 2;

  if (status === "existing") {
    return <span aria-hidden className={base} style={{ ...dim, backgroundColor: statusColor }} />;
  }
  if (status === "rare") {
    return (
      <span
        aria-hidden
        className={cn(base, "flex items-center justify-center")}
        style={{ ...dim, border: `${stroke}px solid ${statusColor}`, backgroundColor: "transparent" }}
      />
    );
  }
  if (status === "gap") {
    const dot = Math.max(3, Math.round(size * 0.36));
    return (
      <span
        aria-hidden
        className={cn(base, "flex items-center justify-center")}
        style={{ ...dim, border: `${stroke}px solid ${statusColor}`, backgroundColor: "transparent" }}
      >
        <span className="block" style={{ width: dot, height: dot, backgroundColor: statusColor }} />
      </span>
    );
  }
  if (status === "tension") {
    return (
      <span
        aria-hidden
        className={base}
        style={{
          ...dim,
          border: `${stroke}px solid ${statusColor}`,
          backgroundColor: "transparent",
          backgroundImage:
            `linear-gradient(to top right, transparent calc(50% - 1px), ${statusColor} calc(50% - 1px), ${statusColor} calc(50% + 1px), transparent calc(50% + 1px)),` +
            `linear-gradient(to top left, transparent calc(50% - 1px), ${statusColor} calc(50% - 1px), ${statusColor} calc(50% + 1px), transparent calc(50% + 1px))`,
        }}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={base}
      style={{
        ...dim,
        backgroundColor: statusColor,
        backgroundImage:
          `repeating-linear-gradient(135deg, color-mix(in srgb, var(--background) 70%, transparent) 0 1.5px, transparent 1.5px 4px)`,
      }}
    />
  );
}

const STATUS_LEGEND_ITEMS: Array<{ status: MapCellStatus; description: string }> = [
  { status: "existing", description: "documented examples" },
  { status: "rare", description: "uncommon but real" },
  { status: "gap", description: "possible, unexplored" },
  { status: "tension", description: "exists with tradeoffs" },
  { status: "impossible", description: "ruled out" },
];

function StatusLegend() {
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-t border-border pt-3">
      <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
        Legend
      </span>
      {STATUS_LEGEND_ITEMS.map(({ status, description }) => (
        <div key={status} className="flex items-center gap-2">
          <StatusMark status={status} size={14} />
          <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-foreground">
            {statusDisplay[status].label}
          </span>
          <span className="text-[12px] leading-none text-muted-foreground">
            {description}
          </span>
        </div>
      ))}
    </div>
  );
}


function columnCode(index: number) {
  // Zero-padded to the natural width of a draftsman's grid column. Two digits
  // is enough for any human-scale map and keeps the codes visually anchored
  // (`A·01`, `B·14`) rather than ragged (`A·1`, `B·14`).
  return String(index + 1).padStart(2, "0");
}

function rowCode(index: number) {
  // A, B, … Z, AA, AB, …
  let value = index;
  let out = "";
  do {
    out = String.fromCharCode(65 + (value % 26)) + out;
    value = Math.floor(value / 26) - 1;
  } while (value >= 0);
  return out;
}

function inferImageExtension(url: string) {
  const cleanUrl = url.split("?")[0] ?? url;
  const match = cleanUrl.match(/\.([a-zA-Z0-9]+)$/);
  const extension = match?.[1]?.toLowerCase();
  return extension && extension.length <= 5 ? extension : "png";
}

function buildDownloadName(document: MapDocument, cell: MapCell, url: string) {
  const extension = inferImageExtension(url);
  return `${document.slug}-${cell.id}.${extension}`.replace(/[^a-zA-Z0-9._-]+/g, "-");
}

function buildRefDownloadName(document: MapDocument, cell: MapCell, example: MapExample, url: string, idx: number) {
  const extension = inferImageExtension(url);
  const tail = `${example.name}-${idx + 1}`.replace(/[^a-zA-Z0-9]+/g, "-");
  return `${document.slug}-${cell.id}-${tail}.${extension}`.replace(/[^a-zA-Z0-9._-]+/g, "-");
}

function exampleHasReferenceImage(example: MapExample | null | undefined): boolean {
  return !!example && (example.referenceImages?.length ?? 0) > 0;
}

/**
 * Pick THE example to feature on a cell tile. The picked example drives both
 * the tile title AND the background image — they must agree, otherwise users
 * see "Title A" over "Image of B". Preference order:
 *   1. The featured-at-coord example, if it has a reference image.
 *   2. The first cell example with a reference image.
 *   3. The featured-at-coord example (no image yet).
 *   4. The first cell example.
 */
function pickFeatureExample(
  cell: MapCell,
  featuredAtCoord: MapExample | undefined,
): MapExample | null {
  if (exampleHasReferenceImage(featuredAtCoord)) return featuredAtCoord ?? null;
  const cellWithImage = cell.examples.find(exampleHasReferenceImage);
  if (cellWithImage) return cellWithImage;
  return featuredAtCoord ?? cell.examples[0] ?? null;
}

type CellReferenceGalleryItem = {
  hit: ExampleImageHit;
  example: MapExample;
  exampleIndex: number;
  imageIndex: number;
};

function buildCellReferenceGallery(cell: MapCell): CellReferenceGalleryItem[] {
  const out: CellReferenceGalleryItem[] = [];
  for (let exampleIndex = 0; exampleIndex < cell.examples.length; exampleIndex++) {
    const example = cell.examples[exampleIndex]!;
    const images = (example.referenceImages ?? []).filter((h) => h.thumbnail && h.link);
    for (let imageIndex = 0; imageIndex < images.length; imageIndex++) {
      const hit = images[imageIndex]!;
      out.push({ hit, example, exampleIndex, imageIndex });
    }
  }
  return out;
}

function resolvePreviewImage(
  cell: MapCell,
  feature: MapExample | null,
  effectiveVizUrl?: string,
) {
  if (effectiveVizUrl) {
    return { url: effectiveVizUrl, alt: `Visualization for ${cell.label}` };
  }
  // Gap cells stay empty until the user explicitly sketches them — even if
  // the engine attached reference images to nearby examples, we don't want
  // the tile to imply the gap has been filled.
  if (cell.status === "gap") return null;
  const ref = feature?.referenceImages?.[0];
  if (!ref?.thumbnail) return null;
  return {
    url: ref.thumbnail,
    alt: ref.title ?? `Reference image for ${feature?.name ?? cell.label}`,
  };
}

async function copyVisualizationAsset(imageUrl: string) {
  const absoluteUrl = new URL(imageUrl, window.location.href).toString();

  try {
    const response = await fetch(absoluteUrl);
    if (!response.ok) throw new Error(`Failed to fetch image (${response.status})`);
    const blob = await response.blob();

    if (navigator.clipboard?.write && window.ClipboardItem) {
      await navigator.clipboard.write([
        new window.ClipboardItem({
          [blob.type || "image/png"]: blob,
        }),
      ]);
      return "image" as const;
    }
  } catch {
    /* fall through to text copy */
  }

  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(absoluteUrl);
    return "link" as const;
  }

  throw new Error("Clipboard access is unavailable in this browser.");
}

export function MapRenderer({
  document,
  live = false,
}: {
  document: MapDocument;
  live?: boolean;
}) {
  const xDimension =
    document.dimensions.find((dimension) => dimension.key === document.cellSchema.primaryX) ?? document.dimensions[0];
  const yDimension =
    document.dimensions.find((dimension) => dimension.key === document.cellSchema.primaryY) ?? document.dimensions[1];

  if (!xDimension || !yDimension || !xDimension.values?.length || !yDimension.values?.length) {
    return <LiveSkeletonGrid live={live} />;
  }

  return <MapRendererInner document={document} xDimension={xDimension} yDimension={yDimension} live={live} />;
}

function MapRendererInner({
  document,
  xDimension,
  yDimension,
  live,
}: {
  document: MapDocument;
  xDimension: MapDocument["dimensions"][number];
  yDimension: MapDocument["dimensions"][number];
  live: boolean;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data: session, isPending: authPending } = authClient.useSession();
  const columns = xDimension.values;
  const rows = yDimension.values;
  const isSignedIn = Boolean(session?.user);
  const signInHref = useMemo(
    () => buildAuthRedirectHref("/auth/sign-in", pathname, searchParams),
    [pathname, searchParams],
  );

  const cellByCoord = useMemo(() => {
    const map = new Map<string, MapCell>();
    for (const cell of document.cells) {
      const key = `${cell.coordinates[yDimension.key]}\u0000${cell.coordinates[xDimension.key]}`;
      map.set(key, cell);
    }
    return map;
  }, [document.cells, xDimension.key, yDimension.key]);

  // First featured example keyed by the cell's coord pair — used to promote a
  // concrete specimen name into the tile header.
  const featuredByCoord = useMemo(() => {
    const map = new Map<string, MapExample>();
    for (const example of document.featuredExamples) {
      const key = `${example.coordinates[yDimension.key]}\u0000${example.coordinates[xDimension.key]}`;
      if (!map.has(key)) map.set(key, example);
    }
    return map;
  }, [document.featuredExamples, xDimension.key, yDimension.key]);

  const pickSpecimen = useCallback(
    (cell: MapCell): MapExample | null => {
      const key = `${cell.coordinates[yDimension.key]}\u0000${cell.coordinates[xDimension.key]}`;
      return pickFeatureExample(cell, featuredByCoord.get(key));
    },
    [featuredByCoord, xDimension.key, yDimension.key],
  );

  const [activeCellId, setActiveCellId] = useState<string | null>(null);
  const activeCell = useMemo(
    () => document.cells.find((c) => c.id === activeCellId) ?? null,
    [activeCellId, document.cells],
  );

  const closeDrawer = useCallback(() => setActiveCellId(null), []);

  useEffect(() => {
    const hash = typeof window !== "undefined" ? window.location.hash.slice(1) : "";
    if (!hash.startsWith("map-cell-")) return;
    const cellId = hash.slice("map-cell-".length);
    if (!cellId || !document.cells.some((c) => c.id === cellId)) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount-time deep-link sync for opening a cell drawer from the URL hash.
    setActiveCellId(cellId);
    requestAnimationFrame(() => {
      window.document.getElementById(hash)?.scrollIntoView({ block: "center", behavior: "smooth" });
    });
  }, [document.cells, document.slug]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(
      new CustomEvent("raster:cell-detail-toggle", {
        detail: { open: Boolean(activeCellId) },
      }),
    );
    return () => {
      window.dispatchEvent(
        new CustomEvent("raster:cell-detail-toggle", {
          detail: { open: false },
        }),
      );
    };
  }, [activeCellId]);

  const generatableCells = useMemo(
    () => document.cells.filter((cell) => canGenerateVisualization(cell.status)),
    [document.cells],
  );
  const matrixColumnTemplate = `minmax(5.5rem, 8rem) repeat(${columns.length}, minmax(6.5rem, 1fr))`;
  const matrixGridStyle = {
    gridTemplateColumns: matrixColumnTemplate,
    gridTemplateRows: `auto repeat(${rows.length}, minmax(7rem, 1fr))`,
  } as React.CSSProperties;

  return (
    <VisualizeRegistryProvider cells={generatableCells} document={document}>
    <div className="flex flex-col gap-2 md:flex-1 md:min-h-0">
      {/* Mobile: axis names as distinct headings above the tile grid. */}
      <div className="md:hidden">
        <div className="mb-3 space-y-1 border-b border-border pb-3">
          <p
            className={cn(
              "font-mono text-[12px] font-semibold uppercase tracking-[0.36em] text-foreground",
              live && "live-text-reveal",
            )}
          >
            {xDimension.label}
          </p>
          <p
            className={cn(
              "font-mono text-[12px] font-semibold uppercase tracking-[0.36em] text-foreground",
              live && "live-text-reveal",
            )}
            style={live ? ({ animationDelay: "0.06s" } as React.CSSProperties) : undefined}
          >
            {yDimension.label}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-px bg-border">
          {document.cells.map((cell, index) => {
            const colIdx = columns.indexOf(cell.coordinates[xDimension.key]);
            const rowIdx = rows.indexOf(cell.coordinates[yDimension.key]);
            // Same image-pending hold as the desktop matrix: keep image-
            // eligible cells in placeholder until their reference image lands.
            if (live) {
              const expectsImage = cell.status !== "gap" && cellFirstSearchableQuery(cell) !== null;
              const cellHasImage = cell.examples.some(exampleHasReferenceImage);
              if (expectsImage && !cellHasImage) {
                return (
                  <PlaceholderCell
                    key={`${cell.id}-pending`}
                    seedIndex={index}
                    ariaLabel={`Awaiting reference image for ${cell.label}`}
                  />
                );
              }
            }
            const tile = (
              <CellTile
                cell={cell}
                colIdx={colIdx < 0 ? index % columns.length : colIdx}
                rowIdx={rowIdx < 0 ? Math.floor(index / columns.length) : rowIdx}
                onOpen={() => setActiveCellId(cell.id)}
                active={activeCellId === cell.id}
                specimen={pickSpecimen(cell)}
                isSignedIn={isSignedIn}
                authPending={authPending}
                signInHref={signInHref}
              />
            );
            if (live) {
              const delay = (index % 7) * 0.03;
              return (
                <motion.div
                  key={cell.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{
                    duration: MOTION_DURATION.short,
                    ease: MOTION_EASE.out,
                    delay,
                  }}
                  className="contents"
                >
                  {tile}
                </motion.div>
              );
            }
            return <Fragment key={cell.id}>{tile}</Fragment>;
          })}
        </div>
      </div>

      {/*
        Matrix (md+): top strip names both axes; grid below is ticks + cells only.
      */}
      <div
        className="relative hidden flex-col gap-px border-t border-x border-border bg-background md:flex md:flex-1 md:min-h-0"
        role="grid"
        aria-label={`Matrix of ${xDimension.label} against ${yDimension.label}`}
      >
        <div
          className="grid shrink-0 gap-px bg-border"
          style={{ gridTemplateColumns: matrixColumnTemplate }}
        >
          <div className="min-h-0 bg-background px-3 py-2.5 lg:px-2 lg:py-2">
            <span
              className={cn(
                "whitespace-normal break-words font-sans text-[12px] font-semibold leading-tight tracking-[-0.005em] text-foreground normal-case lg:text-[13px]",
                live && "live-text-reveal",
              )}
            >
              {yDimension.label}
            </span>
          </div>
          <div
            className="flex min-h-0 items-center justify-center bg-background px-3 py-2.5 text-center lg:px-2 lg:py-2"
            style={{ gridColumn: "2 / -1" }}
          >
            <span
              className={cn(
                "whitespace-normal break-words font-sans text-[12px] font-semibold leading-tight tracking-[-0.01em] text-foreground normal-case lg:text-[13px]",
                live && "live-text-reveal",
              )}
              style={live ? ({ animationDelay: "0.06s" } as React.CSSProperties) : undefined}
            >
              {xDimension.label}
            </span>
          </div>
        </div>

        <div className="grid min-h-0 w-full flex-1 gap-px overflow-hidden bg-border" style={matrixGridStyle}>
          <div
            className="relative flex items-end justify-end bg-background pb-1.5 pr-1.5"
            style={{ gridColumn: "1", gridRow: "1" }}
            aria-hidden
          >
            {/* Crosshair where the X and Y axis label rails meet — drafting paper
                idiom, anchored to the bottom-right of the corner cell so it sits
                exactly at the matrix origin. */}
            <span
              aria-hidden
              className="font-mono text-[14px] leading-none text-muted-foreground/55"
            >
              +
            </span>
          </div>
          <div
            className="grid min-h-0 gap-px bg-border"
            style={{
              gridColumn: "2 / -1",
              gridRow: "1",
              gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))`,
            }}
          >
            {columns.map((column, index) => {
              const headerDelay = live ? `${0.12 + index * 0.04}s` : undefined;
              return (
                <div
                  key={`col-${index}-${column}`}
                  className="flex min-h-0 flex-col justify-end gap-1 bg-background px-3 py-2.5 lg:px-2 lg:py-2"
                  role="columnheader"
                >
                  <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.22em] text-primary">
                    {columnCode(index)}
                  </span>
                  <span
                    className={cn(
                      "whitespace-normal break-words font-sans text-[13px] font-semibold leading-tight tracking-[-0.005em] text-foreground normal-case lg:text-[13px]",
                      live && "live-text-reveal",
                    )}
                    style={
                      live ? ({ animationDelay: headerDelay } as React.CSSProperties) : undefined
                    }
                  >
                    {column}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Row value headers + data cells — rows 2+ */}
          {rows.map((row, rowIndex) => {
            const rowHeaderDelay = live ? `${0.12 + rowIndex * 0.04}s` : undefined;
            return (
            <Fragment key={`row-${row}`}>
              <div
                className="flex flex-col justify-center gap-1 bg-background px-3 py-2 lg:px-2"
                role="rowheader"
                style={{ gridColumn: "1", gridRow: `${rowIndex + 2}` }}
              >
                <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.22em] text-primary">
                  {rowCode(rowIndex)}
                </span>
                <span
                  className={cn(
                    "whitespace-normal break-words font-sans text-[13px] font-semibold leading-tight tracking-[-0.005em] text-foreground normal-case",
                    live && "live-text-reveal",
                  )}
                  style={
                    live ? ({ animationDelay: rowHeaderDelay } as React.CSSProperties) : undefined
                  }
                >
                  {row}
                </span>
              </div>
              {columns.map((column, colIndex) => {
                const cell = cellByCoord.get(`${row}\u0000${column}`);
                const position = { gridColumn: `${colIndex + 2}`, gridRow: `${rowIndex + 2}` };
                const seedIndex = rowIndex * columns.length + colIndex;
                if (!cell) {
                  if (live) {
                    return (
                      <PlaceholderCell
                        key={`${row}-${column}`}
                        position={position}
                        seedIndex={seedIndex}
                        ariaLabel={`Generating cell at ${rowCode(rowIndex)}·${columnCode(colIndex)}`}
                      />
                    );
                  }
                  return (
                    <div
                      key={`${row}-${column}`}
                      className="relative aspect-[5/6] bg-background md:h-full md:aspect-auto"
                      role="gridcell"
                      aria-label={`No cell at ${rowCode(rowIndex)}·${columnCode(colIndex)}`}
                      style={position}
                    />
                  );
                }
                // While the map is still generating, hold image-eligible cells
                // in the placeholder state until their reference image lands —
                // the tile only "snaps in" once title and image agree. Cells
                // that don't expect an image (gap/impossible / no searchable
                // example) skip this wait and render immediately.
                if (live) {
                  const expectsImage = cell.status !== "gap" && cellFirstSearchableQuery(cell) !== null;
                  const cellHasImage = cell.examples.some(exampleHasReferenceImage);
                  if (expectsImage && !cellHasImage) {
                    return (
                      <PlaceholderCell
                        key={`${cell.id}-pending`}
                        position={position}
                        seedIndex={seedIndex}
                        ariaLabel={`Awaiting reference image for ${cell.label}`}
                      />
                    );
                  }
                  // Diagonal stagger so a freshly arrived batch reads as one
                  // gentle sweep, not a flash. Bounded to ≤210ms total.
                  const delay = ((rowIndex + colIndex) % 7) * 0.03;
                  return (
                    <motion.div
                      key={cell.id}
                      style={position}
                      className="relative min-h-0 md:h-full"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{
                        duration: MOTION_DURATION.short,
                        ease: MOTION_EASE.out,
                        delay,
                      }}
                    >
                      <CellTile
                        cell={cell}
                        colIdx={colIndex}
                        rowIdx={rowIndex}
                        onOpen={() => setActiveCellId(cell.id)}
                        active={activeCellId === cell.id}
                        specimen={pickSpecimen(cell)}
                        isSignedIn={isSignedIn}
                        authPending={authPending}
                        signInHref={signInHref}
                      />
                    </motion.div>
                  );
                }
                return (
                  <CellTile
                    key={cell.id}
                  cell={cell}
                  colIdx={colIndex}
                  rowIdx={rowIndex}
                  onOpen={() => setActiveCellId(cell.id)}
                  active={activeCellId === cell.id}
                  specimen={pickSpecimen(cell)}
                  isSignedIn={isSignedIn}
                  authPending={authPending}
                  signInHref={signInHref}
                  style={position}
                />
              );
              })}
            </Fragment>
            );
          })}
        </div>
      </div>

      <StatusLegend />

      <CellDrawer
        document={document}
        cell={activeCell}
        onClose={closeDrawer}
        xLabel={xDimension.label}
        yLabel={yDimension.label}
        xValue={activeCell?.coordinates[xDimension.key]}
        yValue={activeCell?.coordinates[yDimension.key]}
        colCode={
          activeCell
            ? columnCode(columns.indexOf(activeCell.coordinates[xDimension.key]))
            : ""
        }
        rowCode={
          activeCell
            ? rowCode(rows.indexOf(activeCell.coordinates[yDimension.key]))
            : ""
        }
        isSignedIn={isSignedIn}
        authPending={authPending}
        signInHref={signInHref}
      />
    </div>
    </VisualizeRegistryProvider>
  );
}

function CellTile({
  cell,
  colIdx,
  rowIdx,
  onOpen,
  active,
  specimen,
  isSignedIn,
  authPending,
  signInHref,
  style,
}: {
  cell: MapCell;
  colIdx: number;
  rowIdx: number;
  onOpen: () => void;
  active: boolean;
  specimen: MapExample | null;
  isSignedIn: boolean;
  authPending: boolean;
  signInHref: string;
  style?: React.CSSProperties;
}) {
  const entry = useVisualizeCell(cell.id);
  const inFlightResult =
    entry?.state.status === "success" ? entry.state.result : null;
  const viz = cell.visualization;
  // Prefer the just-returned in-flight result so the new image appears
  // immediately even before route revalidation lands a new `cell.visualization`.
  const effectiveVizUrl = inFlightResult?.imageUrl ?? viz?.imageUrl;
  const effectiveImageModel = inFlightResult?.imageModel ?? viz?.imageModel;
  // The image always comes from the same example as the title (`specimen`),
  // so users never see "Title A" over an image of B.
  const previewImage = useMemo(
    () => resolvePreviewImage(cell, specimen, effectiveVizUrl),
    [cell, specimen, effectiveVizUrl],
  );
  const canGenerate = canGenerateVisualization(cell.status);
  const firstSearchableQuery = useMemo(() => cellFirstSearchableQuery(cell), [cell]);
  const hasGeneratedViz = Boolean(effectiveVizUrl);
  const hasLoadedVisual = Boolean(previewImage);
  const sketchFormId = visualizeFormId(cell.id);
  const isPendingViz = entry?.isPending ?? false;
  const sketchCopy = visualizationActionCopy(hasGeneratedViz, isPendingViz);
  const canUseGeneration = canGenerate && isSignedIn && !authPending;
  const showSignInForGeneration = canGenerate && !isSignedIn && !authPending;

  const display = statusDisplay[cell.status];
  const code = `${rowCode(rowIdx)}·${columnCode(colIdx)}`;

  const isUnnamedStatus = cell.status === "gap" || cell.status === "impossible";
  const primaryTitle = specimen?.name ?? (isUnnamedStatus ? null : cell.label);

  return (
    <div
      id={`map-cell-${cell.id}`}
      style={{ ...style, ...statusColorStyle(cell.status) }}
      className={cn(
        "group relative isolate flex aspect-[5/6] flex-col overflow-hidden border-0 p-0 text-left text-foreground outline-none md:h-full md:aspect-auto",
        canGenerate
          ? "bg-[color:color-mix(in_srgb,var(--status-color)_38%,var(--card))]"
          : "bg-[color:color-mix(in_srgb,var(--status-color)_11%,var(--card))]",
        "transition-[background-color,box-shadow] duration-150 ease-out",
        "before:pointer-events-none before:absolute before:left-0 before:top-0 before:h-full before:content-['']",
        canGenerate ? "before:w-[3px]" : "before:w-[2px]",
        "before:bg-[var(--status-color)]",
        canGenerate
          ? "outline-none cursor-pointer hover:bg-[color:color-mix(in_srgb,var(--status-color)_50%,var(--card))]"
          : "outline-none cursor-pointer hover:bg-[color:color-mix(in_srgb,var(--status-color)_17%,var(--card))]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        active && "[box-shadow:inset_0_0_0_1px_var(--status-color)]",
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        aria-expanded={active}
        aria-controls="cell-drawer"
        aria-label={`Open detail for ${cell.label}`}
        className="relative z-0 flex min-h-0 flex-1 flex-col border-0 bg-transparent p-0 text-left text-inherit outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <div className="relative flex min-h-0 flex-1 flex-col">
          {previewImage ? (
            <div className="relative min-h-0 flex-1">
              <CellPreviewImage image={previewImage} />
              {hasGeneratedViz && effectiveImageModel ? (
                <VizModelOverlay
                  modelId={effectiveImageModel}
                  className="bottom-9 left-1.5 max-w-[10rem] text-[9px] tracking-[0.14em] md:bottom-10"
                />
              ) : null}
            </div>
          ) : (
            <EmptyCellBody />
          )}

          <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 bg-[linear-gradient(180deg,rgba(7,10,15,0.78),transparent_82%)] px-3 pb-6 pt-2.5 md:px-2 md:pt-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.55)] md:text-[10px]">
              {code}
            </span>
          </div>

          <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-[linear-gradient(180deg,transparent_0%,rgba(7,10,15,0.55)_45%,rgba(7,10,15,0.92)_100%)] px-3 pb-2.5 pt-8 md:px-2 md:pb-2">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/80 [text-shadow:0_1px_2px_rgba(0,0,0,0.55)]">
              {display.label}
            </p>
            {primaryTitle ? (
              <h3 className="mt-1 line-clamp-2 font-sans text-[15px] font-semibold leading-[1.12] tracking-[-0.01em] text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.55)] md:text-[14px]">
                {primaryTitle}
              </h3>
            ) : null}
          </div>
        </div>
      </button>

      {!hasLoadedVisual && (firstSearchableQuery || canGenerate) ? (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center gap-1.5">
          {cell.status === "gap" ? (
            canUseGeneration ? (
              isPendingViz ? (
                <div
                  className={cn(sketchPillClass, "cursor-default hover:translate-y-0")}
                  aria-label={`Sketching ${cell.label}`}
                  title="Sketching…"
                >
                  <Spinner size="sm" className="opacity-80" />
                  <span>Sketching…</span>
                </div>
              ) : (
                <button
                  type="submit"
                  form={sketchFormId}
                  disabled={!entry?.formAction}
                  aria-label={`Sketch this gap: ${cell.label}`}
                  title="Sketch this gap"
                  className={sketchPillClass}
                >
                  <Sparkles className="h-3.5 w-3.5" aria-hidden strokeWidth={2.15} />
                  <span>Sketch</span>
                </button>
              )
            ) : showSignInForGeneration ? (
              <a
                href={signInHref}
                aria-label={`Sign in to sketch ${cell.label}`}
                title="Sign in to sketch this gap"
                className={sketchPillClass}
              >
                <Sparkles className="h-3.5 w-3.5" aria-hidden strokeWidth={2.15} />
                <span>Sign in to sketch</span>
              </a>
            ) : null
          ) : (
            <>
              {firstSearchableQuery ? (
                <a
                  href={googleImagesSearchUrl(firstSearchableQuery)}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Search Google Images for ${firstSearchableQuery}`}
                  title={`Search "${firstSearchableQuery}" on Google Images`}
                  className={tileEmptyActionClass}
                >
                  <ImageIcon className="h-3.5 w-3.5" aria-hidden strokeWidth={2.15} />
                </a>
              ) : null}
              {canUseGeneration ? (
                isPendingViz ? (
                  <div
                    className={cn(tileEmptyActionClass, "w-20 cursor-default px-2 hover:translate-y-0")}
                    aria-label={`${sketchCopy.pendingLabel} ${cell.label}`}
                    title={sketchCopy.pendingLabel}
                  >
                    <IndeterminateLoadingBar label={`${sketchCopy.pendingLabel} ${cell.label}`} thin className="w-full" />
                  </div>
                ) : (
                  <button
                    type="submit"
                    form={sketchFormId}
                    disabled={!entry?.formAction}
                    aria-label={`${sketchCopy.actionLabel} for ${cell.label}`}
                    title={sketchCopy.actionLabel}
                    className={tileEmptyActionClass}
                  >
                    <Sparkles className="h-3.5 w-3.5" aria-hidden strokeWidth={2.15} />
                  </button>
                )
              ) : showSignInForGeneration ? (
                <a
                  href={signInHref}
                  aria-label={`Sign in to generate ${cell.label}`}
                  title="Sign in to generate"
                  className={tileEmptyActionClass}
                >
                  <Sparkles className="h-3.5 w-3.5" aria-hidden strokeWidth={2.15} />
                </a>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

function CellPreviewImage({ image }: { image: { url: string; alt: string } }) {
  // Hover lift/scale removed: the parent tile shifted by 1px while the inner
  // <img> scaled at the same time, and the two compositing layers never
  // resolved to the same subpixel grid — the border/edge flickered. The bg
  // color shift on the parent now carries the hover state on its own.
  return (
    <div
      className={cn(
        TILE_VISUAL_FRAME_CLASS,
        "flex items-center justify-center bg-[color:color-mix(in_srgb,var(--foreground)_6%,var(--background))]",
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        key={image.url}
        src={image.url}
        alt={image.alt}
        width={640}
        height={480}
        loading="lazy"
        referrerPolicy="no-referrer"
        className="live-image-reveal h-full w-full object-cover [transform:translateZ(0)]"
      />
    </div>
  );
}

function EmptyCellBody() {
  return (
    <div
      className={cn(
        TILE_VISUAL_FRAME_CLASS,
        "flex items-center justify-center bg-[color:color-mix(in_srgb,var(--status-color)_14%,var(--card))]",
      )}
    />
  );
}

/**
 * Empty cell during live generation. Hatched background (matching the
 * map-card synthetic placeholder language) with a barely-perceptible
 * staggered breath. No icon, no color — visual weight only.
 */
function PlaceholderCell({
  position,
  seedIndex,
  ariaLabel,
}: {
  position?: React.CSSProperties;
  seedIndex: number;
  ariaLabel: string;
}) {
  const delay = `${(seedIndex * 0.22) % 5.2}s`;
  const style = position
    ? ({ ...position, animationDelay: delay } as React.CSSProperties)
    : ({ animationDelay: delay } as React.CSSProperties);
  return (
    <div
      role="gridcell"
      aria-label={ariaLabel}
      aria-busy="true"
      style={style}
      className={cn(
        "live-cell-hatch relative aspect-[5/6] overflow-hidden border-0",
        position && "md:h-full md:aspect-auto",
      )}
    />
  );
}

/**
 * Warm-up skeleton shown before the live map's axes resolve. Same hatched
 * cell language as PlaceholderCell, laid out 4×4.
 */
function LiveSkeletonGrid({ live = true }: { live?: boolean }) {
  const cellCount = 16;
  return (
    <div
      className={cn(
        "relative flex min-h-[18rem] flex-1 flex-col gap-px overflow-hidden border border-border bg-background",
        !live && "opacity-70",
      )}
      role="status"
      aria-live="polite"
      aria-label="Sketching the grid"
    >
      <div className="grid h-full flex-1 grid-cols-4 grid-rows-4 gap-px bg-border">
        {Array.from({ length: cellCount }, (_, idx) => (
          <div
            key={idx}
            className={cn("relative", live && "live-cell-hatch")}
            style={{ animationDelay: `${(idx * 0.22) % 5.2}s` } as React.CSSProperties}
          />
        ))}
      </div>
    </div>
  );
}

function CellDrawer({
  cell,
  document,
  onClose,
  xLabel,
  yLabel,
  xValue,
  yValue,
  colCode,
  rowCode: rowCodeValue,
  isSignedIn,
  authPending,
  signInHref,
}: {
  cell: MapCell | null;
  document: MapDocument;
  onClose: () => void;
  xLabel: string;
  yLabel: string;
  xValue?: string;
  yValue?: string;
  colCode: string;
  rowCode: string;
  isSignedIn: boolean;
  authPending: boolean;
  signInHref: string;
}) {
  const reduceMotion = useReducedMotion();
  const drawerId = "cell-drawer";

  useEffect(() => {
    if (!cell) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const previousOverflow = window.document.body.style.overflow;
    window.document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleEscape);
    };
  }, [cell, onClose]);

  if (typeof window === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {cell ? (
        <motion.div
          key="cell-drawer-root"
          className="fixed inset-0 z-[90] flex items-stretch justify-end"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{
            duration: reduceMotion ? 0 : MOTION_DURATION.base,
            ease: MOTION_EASE.out,
          }}
          aria-hidden={false}
        >
          <div
            className="absolute inset-0 bg-[color:color-mix(in_srgb,var(--foreground)_55%,transparent)]"
            onClick={onClose}
          />
          <motion.aside
            id={drawerId}
            role="dialog"
            aria-modal="true"
            aria-label={`Detail: ${cell.label}`}
            // Status-tinted left rail: 2px primary edge for unnamed (frontier)
            // cells echoes the cell tile's left bar, so the drawer reads as
            // "of" that cell rather than as a generic side panel.
            className={cn(
              "relative flex h-full w-full max-w-xl flex-col overflow-y-auto overscroll-contain bg-card sm:w-[32rem]",
              isUnnamedCell(cell)
                ? "border-l-2 border-primary/55"
                : "border-l border-border",
            )}
            initial={reduceMotion ? { opacity: 0 } : { x: 40, opacity: 0 }}
            animate={reduceMotion ? { opacity: 1 } : { x: 0, opacity: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { x: 40, opacity: 0 }}
            transition={{
              duration: reduceMotion ? 0 : MOTION_DURATION.base,
              ease: MOTION_EASE.drawer,
            }}
          >
            {/*
              Inner AnimatePresence: when the drawer stays open and the user
              clicks a different cell (cell.id changes), this crossfades the
              body content. Without this, subsequent cell clicks within an
              open drawer would just snap. `initial={false}` skips the
              crossfade on the very first mount — the aside slide-in already
              carries that moment. `mode="popLayout"` removes the exiting
              body from layout flow so the new body slots into the same space
              instead of stacking.
            */}
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.div
                key={cell.id}
                className="flex h-full flex-col"
                initial={reduceMotion ? { opacity: 1 } : { opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{
                  duration: reduceMotion ? 0 : MOTION_DURATION.short,
                  ease: MOTION_EASE.out,
                }}
              >
                <DrawerBody
                  cell={cell}
                  document={document}
                  onClose={onClose}
                  xLabel={xLabel}
                  yLabel={yLabel}
                  xValue={xValue}
                  yValue={yValue}
                  colCode={colCode}
                  rowCodeValue={rowCodeValue}
                  isSignedIn={isSignedIn}
                  authPending={authPending}
                  signInHref={signInHref}
                />
              </motion.div>
            </AnimatePresence>
          </motion.aside>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    window.document.body,
  );
}

function DrawerBody({
  cell,
  document,
  onClose,
  xLabel,
  yLabel,
  xValue,
  yValue,
  colCode,
  rowCodeValue,
  isSignedIn,
  authPending,
  signInHref,
}: {
  cell: MapCell;
  document: MapDocument;
  onClose: () => void;
  xLabel: string;
  yLabel: string;
  xValue?: string;
  yValue?: string;
  colCode: string;
  rowCodeValue: string;
  isSignedIn: boolean;
  authPending: boolean;
  signInHref: string;
}) {
  const reduceMotion = useReducedMotion();
  const entry = useVisualizeCell(cell.id);
  const state: VisualizeCellActionState = entry?.state ?? { status: "idle" };
  const isPending = entry?.isPending ?? false;
  /** Remote form lives in `CellVisualizeOwner`; buttons use `form=` to submit. */
  const vizFormId = visualizeFormId(cell.id);
  const isFormReady = Boolean(entry?.formAction);
  const [isViewerOpen, setIsViewerOpen] = useState(false);
  const [isPublishSheetOpen, setIsPublishSheetOpen] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState<null | "image" | "link" | "error">(null);
  const [isPromptOpen, setIsPromptOpen] = useState(false);
  const [didCopyPrompt, setDidCopyPrompt] = useState(false);

  const persistedViz = cell.visualization;
  const display =
    state.status === "success" && state.result
      ? {
          imageUrl: state.result.imageUrl,
          caption: state.result.caption,
          imageModel: state.result.imageModel,
          prompt: state.result.prompt,
        }
      : persistedViz
        ? {
            imageUrl: persistedViz.imageUrl,
            caption: persistedViz.caption,
            imageModel: persistedViz.imageModel,
            prompt: persistedViz.prompt,
          }
        : null;
  const displayCaption = display ? finalizeVisualizationCaption(display.caption, cell) : undefined;
  const canGenerate = canGenerateVisualization(cell.status);
  const showVisualizationSection = canGenerate || !!display;
  const canUseGeneration = canGenerate && isSignedIn && !authPending;
  const showSignInForGeneration = canGenerate && !isSignedIn && !authPending;
  const canPublishSpotlight = canUseGeneration && !!display?.imageUrl;
  const visualizationCopy = visualizationActionCopy(!!display, isPending);

  useEffect(() => {
    if (!copyFeedback) return;
    const timer = window.setTimeout(() => setCopyFeedback(null), 1800);
    return () => window.clearTimeout(timer);
  }, [copyFeedback]);

  useEffect(() => {
    if (!isViewerOpen) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsViewerOpen(false);
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [isViewerOpen]);

  async function handleCopyClick() {
    if (!display) return;
    try {
      const result = await copyVisualizationAsset(display.imageUrl);
      setCopyFeedback(result);
    } catch {
      setCopyFeedback("error");
    }
  }

  async function handleCopyPrompt() {
    if (!display?.prompt) return;
    try {
      await navigator.clipboard.writeText(display.prompt);
      setDidCopyPrompt(true);
      window.setTimeout(() => setDidCopyPrompt(false), 1800);
    } catch {
      // Clipboard unavailable — silently no-op; user can still select & copy.
    }
  }

  const cellCode = `${rowCodeValue}·${colCode}`;

  const referenceGalleryItems = useMemo(() => buildCellReferenceGallery(cell), [cell]);
  const [referenceGalleryIndex, setReferenceGalleryIndex] = useState(0);
  const referenceGalleryDisplayIndex =
    referenceGalleryItems.length === 0
      ? 0
      : Math.min(referenceGalleryIndex, referenceGalleryItems.length - 1);

  return (
    <>
      <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-border bg-card px-6 py-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
            <span className="text-foreground">{cellCode}</span>
            <span aria-hidden>·</span>
            <StatusMark status={cell.status} size={10} />
            <span className="text-foreground">{statusDisplay[cell.status].label}</span>
          </div>
          <h3 className="mt-2.5 font-sans text-[22px] font-semibold leading-[1.15] tracking-[-0.015em] text-foreground">
            {isUnnamedCell(cell) ? coordinateTitle(yValue, xValue) : cell.label}
          </h3>
          <p className="mt-1.5 font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
            {yLabel}: <span className="text-foreground">{yValue ?? "—"}</span>
            <span className="mx-2">·</span>
            {xLabel}: <span className="text-foreground">{xValue ?? "—"}</span>
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center border border-border bg-background text-muted-foreground transition-colors duration-150 hover:border-border-strong hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          aria-label="Close cell detail"
          title="Close"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </header>

      {/* Existing/rare cells lead with their documented evidence; gap-style
          cells lead with framing + a sketch action and put references last. */}
      {!isUnnamedCell(cell) && referenceGalleryItems.length ? (
        <DrawerReferenceGallery
          document={document}
          cell={cell}
          items={referenceGalleryItems}
          index={referenceGalleryDisplayIndex}
          onIndexChange={setReferenceGalleryIndex}
        />
      ) : null}

      <motion.div
        className="flex-1 px-6 py-6 [&>*+*]:mt-6 [&>*+*]:border-t [&>*+*]:border-border [&>*+*]:pt-6"
        initial={reduceMotion ? undefined : "hidden"}
        animate={reduceMotion ? undefined : "visible"}
        variants={{
          hidden: {},
          visible: { transition: { staggerChildren: 0.05, delayChildren: 0.12 } },
        }}
      >
        {isUnnamedCell(cell) ? (
          <motion.section
            variants={DRAWER_SECTION_VARIANTS}
            className="border-l-2 border-primary/55 bg-[color:color-mix(in_srgb,var(--primary)_5%,transparent)] px-4 py-3"
          >
            <p className="text-[14px] leading-[1.55] text-foreground">
              <span className="font-semibold">
                {cell.status === "gap"
                  ? "Nothing documented sits here."
                  : "This cell is ruled out by the map logic."}
              </span>{" "}
              {cell.status === "gap"
                ? "Sketch what one might look like — the visuals below are reference evidence used to ground the sketch, not examples of this cell."
                : "If you sketch one, the visuals below are evidence used to render the closest plausible version, not documented instances."}
            </p>
          </motion.section>
        ) : null}

        <motion.section variants={DRAWER_SECTION_VARIANTS}>
          <p className="font-sans text-[15px] leading-[1.55] text-foreground">
            {cell.explanation}
          </p>
          {!!cell.badges.length && (
            <ul className="mt-3 flex flex-wrap gap-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              {cell.badges.map((badge) => (
                <li key={badge} className="border border-border bg-background px-2 py-1 text-foreground">
                  {badge}
                </li>
              ))}
            </ul>
          )}
        </motion.section>

        {showVisualizationSection ? (
          <motion.section variants={DRAWER_SECTION_VARIANTS}>
            {!display ? (
              authPending ? (
                <p className="text-[14px] leading-[1.55] text-muted-foreground">
                  Checking your account status…
                </p>
              ) : showSignInForGeneration ? (
                <Button asChild size="lg">
                  <a href={signInHref}>
                    <Sparkles className="h-4 w-4" aria-hidden />
                    Sign in to sketch
                  </a>
                </Button>
              ) : canUseGeneration ? (
                isPending ? (
                  <IndeterminateLoadingBar label={visualizationCopy.pendingLabel} />
                ) : (
                  <Button
                    type="submit"
                    form={vizFormId}
                    disabled={!isFormReady}
                    aria-label={`${visualizationCopy.buttonLabel} ${cell.label}`}
                    size="lg"
                  >
                    <ImageIcon className="h-4 w-4" aria-hidden />
                    {visualizationCopy.buttonLabel}
                  </Button>
                )
              ) : null
            ) : (
              <div className="space-y-3">
                <div className="relative flex items-center justify-center overflow-hidden border border-border bg-[color:color-mix(in_srgb,var(--foreground)_3%,var(--background))]">
                  <button
                    type="button"
                    onClick={() => setIsViewerOpen(true)}
                    className="absolute inset-0 z-10 cursor-zoom-in focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring focus-visible:ring-offset-0"
                    aria-label={`Open larger view for ${cell.label}`}
                    title="Open larger view"
                  />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    key={display.imageUrl}
                    src={display.imageUrl}
                    alt={`Visualization for ${cell.label}`}
                    width={1024}
                    height={768}
                    loading="lazy"
                    className="live-image-reveal max-h-[70vh] w-full object-contain"
                  />
                  <div className="absolute right-2 top-2 z-20 flex gap-1.5">
                    <IconChip
                      as="button"
                      onClick={() => setIsViewerOpen(true)}
                      label={`Inspect ${cell.label}`}
                    >
                      <Expand className="h-3.5 w-3.5" aria-hidden strokeWidth={2.25} />
                    </IconChip>
                    <IconChip as="button" onClick={handleCopyClick} label={`Copy ${cell.label}`}>
                      <Copy className="h-3.5 w-3.5" aria-hidden strokeWidth={2.25} />
                    </IconChip>
                    <IconChip
                      as="a"
                      href={display.imageUrl}
                      download={buildDownloadName(document, cell, display.imageUrl)}
                      label={`Download ${cell.label}`}
                    >
                      <Download className="h-3.5 w-3.5" aria-hidden strokeWidth={2.25} />
                    </IconChip>
                  </div>
                  {display.imageModel ? <VizModelOverlay modelId={display.imageModel} /> : null}
                </div>
                {displayCaption ? (
                  <p className="font-mono text-[12px] leading-[1.55] text-muted-foreground">
                    {displayCaption}
                  </p>
                ) : null}
                {canGenerate && isPending ? (
                  <IndeterminateLoadingBar thin label="Trying another scene" />
                ) : null}
                {copyFeedback ? (
                  <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-primary">
                    {copyFeedback === "image"
                      ? "Copied image."
                      : copyFeedback === "link"
                        ? "Copied image link."
                        : "Copy unavailable in this browser."}
                  </p>
                ) : null}
                {canUseGeneration ? (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="submit"
                      form={vizFormId}
                      disabled={isPending || !isFormReady}
                      aria-label={`${visualizationCopy.buttonLabel} for ${cell.label}`}
                      variant="secondary"
                      size="sm"
                    >
                      <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                      {visualizationCopy.buttonLabel}
                    </Button>
                    {canPublishSpotlight ? (
                      <Button
                        type="button"
                        onClick={() => setIsPublishSheetOpen(true)}
                        size="sm"
                      >
                        <Sparkles className="h-3.5 w-3.5" aria-hidden />
                        Publish
                      </Button>
                    ) : null}
                  </div>
                ) : showSignInForGeneration ? (
                  <Button asChild size="sm">
                    <a href={signInHref}>
                      <Sparkles className="h-3.5 w-3.5" aria-hidden />
                      Sign in
                    </a>
                  </Button>
                ) : null}
                {display.prompt ? (
                  <div>
                    <button
                      type="button"
                      onClick={() => setIsPromptOpen((prev) => !prev)}
                      aria-expanded={isPromptOpen}
                      className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground transition-colors duration-150 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                    >
                      <span>Prompt</span>
                      <ChevronDown
                        className={cn("h-3 w-3 transition-transform duration-150", isPromptOpen && "rotate-180")}
                        aria-hidden
                      />
                    </button>
                    {isPromptOpen ? (
                      <div className="mt-2 space-y-2">
                        <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words border border-border bg-[color:color-mix(in_srgb,var(--foreground)_3%,var(--background))] p-3 font-mono text-[11px] leading-[1.55] text-foreground/85">
                          {display.prompt}
                        </pre>
                        <button
                          type="button"
                          onClick={handleCopyPrompt}
                          className="inline-flex items-center gap-1.5 border border-border bg-background px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground transition-colors duration-150 hover:border-border-strong hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                        >
                          <Copy className="h-3 w-3" aria-hidden />
                          {didCopyPrompt ? "Copied" : "Copy"}
                        </button>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            )}
            {canGenerate && state.status === "error" ? (
              <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.22em] text-primary">
                {state.message}
              </p>
            ) : null}
          </motion.section>
        ) : null}

        {/* Reference evidence — placed last for unnamed cells so the sketch
            framing is the first thing users read. Hidden when no images. */}
        {isUnnamedCell(cell) && referenceGalleryItems.length ? (
          <motion.section variants={DRAWER_SECTION_VARIANTS}>
            <DrawerReferenceGallery
              document={document}
              cell={cell}
              items={referenceGalleryItems}
              index={referenceGalleryDisplayIndex}
              onIndexChange={setReferenceGalleryIndex}
              embedded
            />
          </motion.section>
        ) : null}
      </motion.div>

      {display && isViewerOpen ? (
        <ViewerModal
          cell={cell}
          document={document}
          imageUrl={display.imageUrl}
          imageModel={display.imageModel}
          caption={displayCaption}
          onCopy={handleCopyClick}
          onClose={() => setIsViewerOpen(false)}
        />
      ) : null}
      {display && canPublishSpotlight && isPublishSheetOpen ? (
        <GapSpotlightSheet
          onClose={() => setIsPublishSheetOpen(false)}
          mapSlug={document.slug}
          mapTitle={document.title}
          topicFamily={document.topicFamily}
          cellId={cell.id}
          cellLabel={cell.label}
          coordinatesSnapshot={cell.coordinates}
          imageUrl={display.imageUrl}
          defaultTitle={cell.label}
          defaultSummary={cell.explanation}
        />
      ) : null}
    </>
  );
}

const DRAWER_SECTION_VARIANTS = {
  hidden: { opacity: 0, y: 8 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: MOTION_DURATION.short, ease: MOTION_EASE.out },
  },
};

function DrawerReferenceGallery({
  document,
  cell,
  items,
  index,
  onIndexChange,
  embedded = false,
}: {
  document: MapDocument;
  cell: MapCell;
  items: CellReferenceGalleryItem[];
  index: number;
  onIndexChange: (next: number) => void;
  /**
   * When the gallery sits inside the body (gap-style cells), drop the
   * sticky-card chrome and use a flush layout. The framing label also shifts
   * from "Reference images" to "Visual evidence" to make clear that these
   * inputs ground the sketch and aren't documented examples.
   */
  embedded?: boolean;
}) {
  const reduceMotion = useReducedMotion();
  const stripRef = useRef<HTMLDivElement>(null);
  const item = items[index]!;

  useEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;
    const thumb = strip.querySelector<HTMLElement>(`[data-gallery-index="${index}"]`);
    thumb?.scrollIntoView({
      inline: "center",
      block: "nearest",
      behavior: reduceMotion ? "auto" : "smooth",
    });
  }, [index, reduceMotion]);

  const goPrev = useCallback(() => {
    onIndexChange((index - 1 + items.length) % items.length);
  }, [index, items.length, onIndexChange]);

  const goNext = useCallback(() => {
    onIndexChange((index + 1) % items.length);
  }, [index, items.length, onIndexChange]);

  const downloadName = buildRefDownloadName(
    document,
    cell,
    item.example,
    item.hit.thumbnail!,
    item.imageIndex,
  );

  const headingLabel = embedded ? "Visual evidence" : "Examples";
  const headingHelper = embedded
    ? "Used to ground the sketch — not documented examples of this cell."
    : null;

  return (
    <section
      id="drawer-reference-gallery"
      className={cn(
        embedded ? "" : "shrink-0 border-b border-border bg-card px-6 py-5",
      )}
      aria-label={embedded ? "Visual evidence used to sketch this cell" : "Reference images for this cell"}
    >
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h4 className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
          {headingLabel}
        </h4>
        <span className="font-mono text-[10px] tabular-nums tracking-[0.14em] text-muted-foreground">
          {index + 1} / {items.length}
        </span>
      </div>
      {headingHelper ? (
        <p className="mb-3 text-[12px] leading-snug text-muted-foreground">
          {headingHelper}
        </p>
      ) : null}

      {/* Hero image — single hairline frame, sharp corners, no inset shadow.
       * Matches the project's --radius-sm: 0 design token. */}
      <div className="relative overflow-hidden border border-border bg-[color:color-mix(in_srgb,var(--foreground)_3%,var(--background))]">
        {items.length > 1 ? (
          <>
            <button
              type="button"
              onClick={goPrev}
              className={cn(galleryNavButtonClass, "left-2 md:left-3")}
              aria-label="Previous reference image"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden strokeWidth={2.25} />
            </button>
            <button
              type="button"
              onClick={goNext}
              className={cn(galleryNavButtonClass, "right-2 md:right-3")}
              aria-label="Next reference image"
            >
              <ChevronRight className="h-4 w-4" aria-hidden strokeWidth={2.25} />
            </button>
          </>
        ) : null}
        <div className="flex max-h-[min(46vh,26rem)] min-h-[11rem] items-center justify-center px-3 py-4 md:px-6 md:py-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            key={`${item.hit.link}-${index}`}
            src={item.hit.thumbnail!}
            alt={item.hit.title ?? `Reference: ${item.example.name}`}
            width={1200}
            height={900}
            loading="eager"
            referrerPolicy="no-referrer"
            className="live-image-reveal max-h-[min(46vh,26rem)] w-full object-contain"
          />
        </div>
        <div className="absolute right-2 top-2 z-20 flex gap-1.5 md:right-3 md:top-3">
          <IconChip as="a" href={item.hit.link} label="Open original source page">
            <ArrowUpRight className="h-3.5 w-3.5" aria-hidden strokeWidth={2.25} />
          </IconChip>
          <IconChip
            as="a"
            href={item.hit.thumbnail!}
            download={downloadName}
            label="Download this reference thumbnail"
          >
            <Download className="h-3.5 w-3.5" aria-hidden strokeWidth={2.25} />
          </IconChip>
        </div>
      </div>

      <div className="mt-3 min-w-0 space-y-1">
        <p className="font-sans text-[16px] font-semibold leading-snug tracking-[-0.01em] text-foreground">
          {item.example.name}
        </p>
        {item.hit.title ? (
          <p className="line-clamp-2 text-[13px] leading-relaxed text-muted-foreground">{item.hit.title}</p>
        ) : item.example.brand || item.example.year ? (
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            {[item.example.brand, item.example.year].filter(Boolean).join(" · ")}
          </p>
        ) : null}
      </div>

      <div
        ref={stripRef}
        className="mt-4 flex gap-1.5 overflow-x-auto overscroll-x-contain pb-1 pt-0.5 [scrollbar-width:thin]"
      >
        {items.map((entry, i) => (
          <button
            key={`${entry.hit.link}-${entry.exampleIndex}-${entry.imageIndex}`}
            type="button"
            data-gallery-index={i}
            onClick={() => onIndexChange(i)}
            aria-label={`Show reference ${i + 1} of ${items.length}: ${entry.example.name}`}
            aria-current={i === index ? "true" : undefined}
            className={cn(
              "relative h-16 w-16 shrink-0 overflow-hidden border outline-none ring-offset-background transition-[border-color,opacity] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:h-[4.5rem] sm:w-[4.5rem]",
              i === index
                ? "border-foreground"
                : "border-border opacity-65 hover:border-border-strong hover:opacity-100",
            )}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={entry.hit.thumbnail!}
              alt=""
              loading="lazy"
              referrerPolicy="no-referrer"
              className="h-full w-full object-cover"
            />
          </button>
        ))}
      </div>
    </section>
  );
}

const galleryNavButtonClass =
  "absolute top-1/2 z-20 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center border border-border bg-background/92 text-foreground shadow-[0_2px_12px_rgba(0,0,0,0.14)] backdrop-blur-md transition-[background-color,border-color,color] duration-150 hover:bg-card hover:border-foreground/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background dark:border-white/15 dark:shadow-[0_2px_16px_rgba(0,0,0,0.42)]";

type IconChipProps =
  | ({
      as: "button";
      onClick: () => void | Promise<void>;
      label: string;
      children: React.ReactNode;
    })
  | ({
      as: "a";
      href: string;
      download?: string;
      label: string;
      children: React.ReactNode;
    });

function IconChip(props: IconChipProps) {
  if (props.as === "a") {
    return (
      <a
        href={props.href}
        download={props.download}
        className={mediaOverlayIconChipClass}
        aria-label={props.label}
        title={props.label}
      >
        {props.children}
      </a>
    );
  }
  return (
    <button
      type="button"
      onClick={props.onClick}
      className={mediaOverlayIconChipClass}
      aria-label={props.label}
      title={props.label}
    >
      {props.children}
    </button>
  );
}

function ViewerModal({
  cell,
  document,
  imageUrl,
  imageModel,
  caption,
  onCopy,
  onClose,
}: {
  cell: MapCell;
  document: MapDocument;
  imageUrl: string;
  imageModel?: string;
  caption?: string;
  onCopy: () => void;
  onClose: () => void;
}) {
  if (typeof window === "undefined") return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center overscroll-contain bg-foreground/45 p-4 backdrop-blur-[1px] dark:bg-black/82 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={`Image viewer for ${cell.label}`}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-6xl overflow-hidden border border-border bg-card shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-border bg-card px-4 py-3 text-foreground">
          <div className="min-w-0">
            <p className="truncate font-sans text-[15px] font-semibold tracking-[-0.005em]">{cell.label}</p>
            {caption ? (
              <p className="truncate font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                {caption}
              </p>
            ) : null}
          </div>
          <div className="flex items-center gap-1.5">
            <IconChip as="button" onClick={onCopy} label={`Copy ${cell.label}`}>
              <Copy className="h-3.5 w-3.5" aria-hidden strokeWidth={2.25} />
            </IconChip>
            <IconChip
              as="a"
              href={imageUrl}
              download={buildDownloadName(document, cell, imageUrl)}
              label={`Download ${cell.label}`}
            >
              <Download className="h-3.5 w-3.5" aria-hidden strokeWidth={2.25} />
            </IconChip>
            <IconChip as="button" onClick={onClose} label="Close viewer">
              <X className="h-3.5 w-3.5" aria-hidden strokeWidth={2.25} />
            </IconChip>
          </div>
        </div>
        <div className="relative flex items-center justify-center bg-muted/30 p-4 sm:p-6 dark:bg-background">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt={`Large visualization for ${cell.label}`}
            width={1600}
            height={1200}
            loading="lazy"
            className="max-h-[82vh] w-auto max-w-full object-contain"
          />
          {imageModel ? <VizModelOverlay modelId={imageModel} className="bottom-4 left-4 sm:bottom-6 sm:left-6" /> : null}
        </div>
      </div>
    </div>,
    window.document.body,
  );
}

// Preserve export for legacy import sites that may want the persisted strip.
export { PersistedReferenceThumbnails };
