import { describe, expect, it } from "vitest";
import { exampleHasImageQuery } from "@/lib/utils";
import {
  buildSerpGoogleImagesUrl,
  EXAMPLE_IMAGE_QUERY_MAX,
  normalizeExampleImageQuery,
} from "@/lib/serpapi-images";

describe("exampleHasImageQuery", () => {
  it("requires at least two non-space characters", () => {
    expect(exampleHasImageQuery("ab")).toBe(true);
    expect(exampleHasImageQuery("a")).toBe(false);
    expect(exampleHasImageQuery("  a  ")).toBe(false);
  });
});

describe("normalizeExampleImageQuery", () => {
  it("trims and collapses whitespace", () => {
    expect(normalizeExampleImageQuery("  a  b  ")).toBe("a b");
  });

  it("returns null for short queries", () => {
    expect(normalizeExampleImageQuery("a")).toBeNull();
    expect(normalizeExampleImageQuery("")).toBeNull();
  });

  it("caps length", () => {
    const long = "x".repeat(EXAMPLE_IMAGE_QUERY_MAX + 50);
    const out = normalizeExampleImageQuery(long);
    expect(out).toHaveLength(EXAMPLE_IMAGE_QUERY_MAX);
  });
});

describe("buildSerpGoogleImagesUrl", () => {
  it("sets engine, q, and api_key", () => {
    const url = buildSerpGoogleImagesUrl("coffee cup", "test-key");
    expect(url.origin + url.pathname).toBe("https://serpapi.com/search.json");
    expect(url.searchParams.get("engine")).toBe("google_images");
    expect(url.searchParams.get("q")).toBe("coffee cup");
    expect(url.searchParams.get("api_key")).toBe("test-key");
  });
});
