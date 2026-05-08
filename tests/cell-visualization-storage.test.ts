import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DegenerateImageError,
  materializeCellImageAsset,
} from "@/lib/cell-visualization-storage";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PNG_MAGIC = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
]);

function pngBuffer(byteCount: number): Buffer {
  // Construct a buffer that starts with the PNG signature and is padded to
  // byteCount bytes. Not a valid PNG, but materialization only checks magic
  // bytes + length.
  const padding = Buffer.alloc(Math.max(0, byteCount - PNG_MAGIC.length), 0);
  return Buffer.concat([PNG_MAGIC, padding]);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("materializeCellImageAsset validation", () => {
  it("rejects images smaller than 4 KB with reason='too-small'", async () => {
    const tinyPng = `data:image/png;base64,${pngBuffer(1024).toString("base64")}`;
    const promise = materializeCellImageAsset("slug", "cell-1", tinyPng);
    await expect(promise).rejects.toBeInstanceOf(DegenerateImageError);
    await expect(promise).rejects.toMatchObject({ reason: "too-small" });
  });

  it("rejects buffers that don't start with a recognized image signature", async () => {
    // 8 KB of plain text masquerading as image bytes.
    const html = `data:image/png;base64,${Buffer.from("<html>".repeat(1500)).toString("base64")}`;
    const promise = materializeCellImageAsset("slug", "cell-1", html);
    await expect(promise).rejects.toBeInstanceOf(DegenerateImageError);
    await expect(promise).rejects.toMatchObject({ reason: "wrong-magic-bytes" });
  });

  it("succeeds with a >4KB buffer carrying PNG magic bytes, returning byteHash + url", async () => {
    const dir = await mkdtemp(join(tmpdir(), "cell-viz-test-"));
    const cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(dir);

    const dataUrl = `data:image/png;base64,${pngBuffer(8192).toString("base64")}`;
    const result = await materializeCellImageAsset("test-slug", "cell-42", dataUrl);

    expect(result.byteHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.byteLength).toBe(8192);
    // Cache-buster is the first 8 hex chars of the SHA-256 byte hash so
    // identical re-renders reuse the same URL while new bytes invalidate it.
    expect(result.url).toMatch(/^\/generated-cell-viz\/test-slug\/cell-42\.png\?v=[a-f0-9]{8}$/);
    expect(result.url.endsWith(`?v=${result.byteHash.slice(0, 8)}`)).toBe(true);

    // Sanity: file actually exists on disk and matches.
    const persisted = await readFile(
      join(dir, "public", "generated-cell-viz", "test-slug", "cell-42.png"),
    );
    expect(persisted.length).toBe(8192);

    cwdSpy.mockRestore();
  });

  it("derives extension from magic bytes for HTTP sources (not from URL)", async () => {
    // A buffer with WEBP magic bytes, returned via fetch. Materialization should pick `.webp`.
    const webp = Buffer.concat([
      Buffer.from([
        0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00,
        0x57, 0x45, 0x42, 0x50,
      ]),
      Buffer.alloc(8192, 0),
    ]);
    const fetchMock = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(webp, {
        status: 200,
        headers: { "content-type": "image/webp" },
      }),
    );

    const dir = await mkdtemp(join(tmpdir(), "cell-viz-test-"));
    const cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(dir);

    const result = await materializeCellImageAsset("slug", "cell", "https://img.local/foo");
    expect(result.url).toMatch(/\.webp\?/);

    fetchMock.mockRestore();
    cwdSpy.mockRestore();
  });
});
