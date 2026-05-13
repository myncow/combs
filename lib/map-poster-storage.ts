/**
 * Persist a generated map poster image to Vercel Blob and return a
 * public URL. Closely mirrors `materializeCellImageAsset` but uses a
 * dedicated `map-posters/` prefix and always overwrites the previous
 * poster for the same (slug, content-hash) tuple so the row's
 * `poster_url` stays at the latest artwork.
 */
import { createHash } from "node:crypto";
import { put } from "@vercel/blob";
import { getBlobReadWriteToken } from "@/lib/env";

const MIN_IMAGE_BYTES = 4 * 1024;
const POSTER_DIR = "map-posters";

type ImageFormat = "png" | "jpg" | "webp" | "gif";

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

function safeSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "_").replace(/^_|_$/g, "").slice(0, 96) || "map";
}

async function readImageBuffer(sourceUrl: string): Promise<Buffer> {
  if (sourceUrl.startsWith("data:")) {
    const match = sourceUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) throw new Error("Unsupported data URL (expected base64)");
    return Buffer.from(match[2], "base64");
  }
  const response = await fetch(sourceUrl, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Fetch poster image failed: ${response.status}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

export type MaterializedMapPoster = {
  url: string;
  mimeType: string;
  byteHash: string;
  byteSize: number;
};

export async function materializeMapPoster(
  mapSlug: string,
  sourceUrl: string,
): Promise<MaterializedMapPoster> {
  if (!getBlobReadWriteToken()) {
    throw new Error(
      "Poster persistence is not configured: set BLOB_READ_WRITE_TOKEN in the server environment.",
    );
  }
  const buffer = await readImageBuffer(sourceUrl);
  if (buffer.byteLength < MIN_IMAGE_BYTES) {
    throw new Error(`Poster image is too small (${buffer.byteLength} bytes)`);
  }
  const format = detectImageFormat(buffer);
  if (!format) {
    throw new Error("Poster image has an unrecognized format.");
  }
  const byteHash = createHash("sha256").update(buffer).digest("hex");
  const mimeType = mimeTypeFor(format);
  const pathname = `${POSTER_DIR}/${safeSegment(mapSlug)}-${byteHash.slice(0, 12)}.${format}`;
  const blob = await put(pathname, buffer, {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: mimeType,
  });
  return {
    url: blob.url,
    mimeType: blob.contentType || mimeType,
    byteHash,
    byteSize: buffer.byteLength,
  };
}
