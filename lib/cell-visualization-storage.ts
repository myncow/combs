import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

export type MaterializedCellImage = {
  /** URL to render in the UI (cache-busted relative path or remote/data fallback). */
  url: string;
  /** SHA-256 hex of the validated image bytes — used for cross-cell duplicate detection. */
  byteHash: string;
  /** Final byte length, useful for telemetry. */
  byteLength: number;
};

/**
 * Minimum byte count we require before persisting an image. 4 KB is
 * generous enough to allow tiny PNGs / icons but reliably rejects 1×1
 * placeholder pixels and "stub" payloads from upstream image models.
 */
const MIN_IMAGE_BYTES = 4 * 1024;
const GENERATED_CELL_VIZ_DIR = "generated-cell-viz";

type ImageFormat = "png" | "jpg" | "webp" | "gif";

/**
 * Detect format from magic bytes. Returns `null` for buffers that don't
 * start with a recognized image signature — those are rejected so the
 * public folder never persists HTML error pages masquerading as `.png`.
 */
function detectImageFormat(buffer: Buffer): ImageFormat | null {
  if (buffer.length < 12) return null;
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return "png";
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "jpg";
  if (
    buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
    buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50
  ) return "webp";
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38) return "gif";
  return null;
}

function safeSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "_").replace(/^_|_$/g, "").slice(0, 96) || "item";
}

async function readImageBuffer(sourceUrl: string): Promise<Buffer> {
  if (sourceUrl.startsWith("data:")) {
    const match = sourceUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) {
      throw new Error("Unsupported data URL (expected base64)");
    }
    return Buffer.from(match[2], "base64");
  }

  const response = await fetch(sourceUrl, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Fetch image failed: ${response.status}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

export class DegenerateImageError extends Error {
  readonly reason: "too-small" | "wrong-magic-bytes";
  constructor(reason: "too-small" | "wrong-magic-bytes", details: string) {
    super(`Degenerate image rejected (${reason}): ${details}`);
    this.reason = reason;
  }
}

/**
 * Writes image bytes under `public/generated-cell-viz/{slug}/{cellId}.ext` and returns a site path.
 * We intentionally avoid the historical `public/cell-viz` tree here because
 * Vercel traces that directory into server actions and can blow past the
 * 250 MB function size limit on routes that import those actions.
 *
 * The returned URL carries a content-addressed `?v={byteHash[0..8]}` query so
 * re-rendering with new bytes produces a new URL (forcing browser cache miss),
 * while a re-render that produces *identical* bytes reuses the same URL —
 * cleaner than `Date.now()` which would race in the same millisecond and
 * would needlessly invalidate caches on identical re-runs.
 *
 * Validates the buffer:
 * - Must be at least MIN_IMAGE_BYTES so we never persist 1×1 placeholders.
 * - Must start with PNG/JPEG/WEBP/GIF magic bytes so we don't store HTML/error pages.
 *
 * Throws `DegenerateImageError` when validation fails — the caller can choose
 * whether to surface a retry or report failure. On filesystem write failure
 * (e.g. read-only serverless FS) returns `sourceUrl` unchanged.
 */
export async function materializeCellImageAsset(
  mapSlug: string,
  cellId: string,
  sourceUrl: string,
): Promise<MaterializedCellImage> {
  const buffer = await readImageBuffer(sourceUrl);

  if (buffer.byteLength < MIN_IMAGE_BYTES) {
    throw new DegenerateImageError(
      "too-small",
      `${buffer.byteLength} bytes < ${MIN_IMAGE_BYTES} bytes`,
    );
  }
  const format = detectImageFormat(buffer);
  if (!format) {
    throw new DegenerateImageError(
      "wrong-magic-bytes",
      `first bytes: ${buffer.subarray(0, 12).toString("hex")}`,
    );
  }

  const byteHash = createHash("sha256").update(buffer).digest("hex");
  const byteLength = buffer.byteLength;
  const cacheBuster = byteHash.slice(0, 8);

  try {
    const ext = format;
    const dirSeg = safeSegment(mapSlug);
    const cellSeg = safeSegment(cellId);
    const dir = join(process.cwd(), "public", GENERATED_CELL_VIZ_DIR, dirSeg);
    await mkdir(dir, { recursive: true });
    const filename = `${cellSeg}.${ext}`;
    await writeFile(join(dir, filename), buffer);
    return {
      url: `/${GENERATED_CELL_VIZ_DIR}/${dirSeg}/${filename}?v=${cacheBuster}`,
      byteHash,
      byteLength,
    };
  } catch (error) {
    console.warn("cell-viz: could not write file, keeping remote/data URL", error);
    return { url: sourceUrl, byteHash, byteLength };
  }
}
