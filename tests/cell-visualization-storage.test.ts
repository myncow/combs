import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DegenerateImageError,
  materializeCellImageAsset,
} from "@/lib/cell-visualization-storage";

const putMock = vi.fn();

vi.mock("@vercel/blob", () => ({
  put: (...args: unknown[]) => putMock(...args),
}));

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
  putMock.mockReset();
  delete process.env.BLOB_READ_WRITE_TOKEN;
});

describe("materializeCellImageAsset validation", () => {
  it("rejects images smaller than 4 KB with reason='too-small'", async () => {
    process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_test";
    const tinyPng = `data:image/png;base64,${pngBuffer(1024).toString("base64")}`;
    const promise = materializeCellImageAsset("slug", "cell-1", tinyPng);
    await expect(promise).rejects.toBeInstanceOf(DegenerateImageError);
    await expect(promise).rejects.toMatchObject({ reason: "too-small" });
  });

  it("rejects buffers that don't start with a recognized image signature", async () => {
    process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_test";
    // 8 KB of plain text masquerading as image bytes.
    const html = `data:image/png;base64,${Buffer.from("<html>".repeat(1500)).toString("base64")}`;
    const promise = materializeCellImageAsset("slug", "cell-1", html);
    await expect(promise).rejects.toBeInstanceOf(DegenerateImageError);
    await expect(promise).rejects.toMatchObject({ reason: "wrong-magic-bytes" });
  });

  it("succeeds with a >4KB buffer carrying PNG magic bytes, returning byteHash + url", async () => {
    process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_test";
    putMock.mockResolvedValueOnce({
      url: "https://assets.public.blob.vercel-storage.com/generated-cell-viz/test-slug/cell-42-deadbeef.png",
      pathname: "generated-cell-viz/test-slug/cell-42-deadbeefcaf0.png",
      contentType: "image/png",
    });

    const dataUrl = `data:image/png;base64,${pngBuffer(8192).toString("base64")}`;
    const result = await materializeCellImageAsset("test-slug", "cell-42", dataUrl);

    expect(result.byteHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.byteSize).toBe(8192);
    expect(result.provider).toBe("vercel_blob");
    expect(result.mimeType).toBe("image/png");
    expect(result.storageKey).toMatch(/^generated-cell-viz\/test-slug\/cell-42-[a-f0-9]{12}\.png$/);
    expect(result.url).toContain("vercel-storage.com/generated-cell-viz/test-slug/cell-42-deadbeef.png");
    expect(putMock).toHaveBeenCalledWith(
      expect.stringMatching(/^generated-cell-viz\/test-slug\/cell-42-[a-f0-9]{12}\.png$/),
      expect.any(Buffer),
      expect.objectContaining({
        access: "public",
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: "image/png",
      }),
    );
  });

  it("derives extension from magic bytes for HTTP sources (not from URL)", async () => {
    process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_test";
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
    putMock.mockResolvedValueOnce({
      url: "https://assets.public.blob.vercel-storage.com/generated-cell-viz/slug/cell-webp.webp",
      pathname: "generated-cell-viz/slug/cell-webp.webp",
      contentType: "image/webp",
    });

    const result = await materializeCellImageAsset("slug", "cell", "https://img.local/foo");
    expect(result.url).toMatch(/\.webp$/);
    expect(result.mimeType).toBe("image/webp");
    expect(result.storageKey).toMatch(/\.webp$/);

    fetchMock.mockRestore();
  });
});
