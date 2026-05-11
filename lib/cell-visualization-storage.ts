import { createHash } from "node:crypto";
import { put } from "@vercel/blob";
import { getBlobReadWriteToken } from "@/lib/env";

export type MaterializedCellImage = {
  /** Public, durable URL to render in the UI. */
  url: string;
  /** Persistent provider identifier used by media_assets. */
  provider: "vercel_blob";
  /** Blob pathname within the store. */
  storageKey: string;
  /** Uploaded MIME type. */
  mimeType: string;
  /** SHA-256 hex of the validated image bytes — used for cross-cell duplicate detection. */
  byteHash: string;
  /** Final byte length, useful for telemetry and DB persistence. */
  byteSize: number;
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

function mimeTypeFor(format: ImageFormat): string {
  switch (format) {
    case "png":
      return "image/png";
    case "jpg":
      return "image/jpeg";
    case "webp":
      return "image/webp";
    case "gif":
      return "image/gif";
  }
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
 * Uploads image bytes to Vercel Blob under a content-addressed pathname so
 * local development and production share the exact same persistence path.
 *
 * Validates the buffer:
 * - Must be at least MIN_IMAGE_BYTES so we never persist 1×1 placeholders.
 * - Must start with PNG/JPEG/WEBP/GIF magic bytes so we don't store HTML/error pages.
 *
 * Throws `DegenerateImageError` when validation fails. Throws a clear regular
 * Error when Blob storage is unconfigured.
 */
export async function materializeCellImageAsset(
  mapSlug: string,
  cellId: string,
  sourceUrl: string,
): Promise<MaterializedCellImage> {
  if (!getBlobReadWriteToken()) {
    throw new Error(
      "Generated image persistence is not configured: set BLOB_READ_WRITE_TOKEN in the server environment.",
    );
  }

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
  const byteSize = buffer.byteLength;
  const ext = format;
  const mimeType = mimeTypeFor(format);
  const dirSeg = safeSegment(mapSlug);
  const cellSeg = safeSegment(cellId);
  const pathname = `${GENERATED_CELL_VIZ_DIR}/${dirSeg}/${cellSeg}-${byteHash.slice(0, 12)}.${ext}`;

  const blob = await put(pathname, buffer, {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: mimeType,
  });

  return {
    url: blob.url,
    provider: "vercel_blob",
    storageKey: blob.pathname,
    mimeType: blob.contentType || mimeType,
    byteHash,
    byteSize,
  };
}
