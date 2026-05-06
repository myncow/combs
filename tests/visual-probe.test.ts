import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ProbeBudget,
  axisValueProbeQuery,
  probePairsByAxisValues,
} from "@/lib/visual-probe";
import * as serp from "@/lib/serpapi-images";

vi.mock("@/lib/serpapi-images", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/serpapi-images")>();
  return {
    ...actual,
    getSerpApiKey: vi.fn(() => "test-key"),
    fetchGoogleImageExampleResults: vi.fn(),
  };
});

beforeEach(() => {
  vi.mocked(serp.getSerpApiKey).mockReturnValue("test-key");
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("axisValueProbeQuery", () => {
  it("joins topic, axis, and value, trimming whitespace", () => {
    expect(axisValueProbeQuery("footwear", "Surface friction", "Pronounced lugs")).toBe(
      "footwear Surface friction Pronounced lugs",
    );
  });

  it("skips empty parts", () => {
    expect(axisValueProbeQuery("", "Material", "Steel")).toBe("Material Steel");
  });

  it("caps long queries to 180 chars", () => {
    const long = "x".repeat(300);
    expect(axisValueProbeQuery(long, "axis", "value").length).toBeLessThanOrEqual(180);
  });
});

describe("ProbeBudget", () => {
  it("reports no-key when SERPAPI is unconfigured", async () => {
    vi.mocked(serp.getSerpApiKey).mockReturnValue(null);
    const budget = new ProbeBudget(10);
    const result = await budget.probe("anything");
    expect(result.skipped).toBe("no-key");
    expect(result.hits).toEqual([]);
  });

  it("rejects queries that fail normalization without spending budget", async () => {
    const budget = new ProbeBudget(10);
    const result = await budget.probe("x"); // single char fails normalize (min 2)
    expect(result.skipped).toBe("invalid-query");
    expect(budget.callsUsed).toBe(0);
  });

  it("memoizes repeated queries: only one network request, both budget calls share the result", async () => {
    vi.mocked(serp.fetchGoogleImageExampleResults).mockResolvedValue({
      results: [
        { link: "https://a.example/1", thumbnail: "https://a.example/1t", source: "a" },
        { link: "https://b.example/2", thumbnail: "https://b.example/2t", source: "b" },
      ],
    });

    const budget = new ProbeBudget(10);
    const a = await budget.probe("rare query");
    const b = await budget.probe("rare query");
    expect(a.picturable).toBe(true);
    expect(b.picturable).toBe(true);
    expect(serp.fetchGoogleImageExampleResults).toHaveBeenCalledTimes(1);
    expect(budget.callsUsed).toBe(1);
  });

  it("returns skipped='budget' when limit is exhausted", async () => {
    vi.mocked(serp.fetchGoogleImageExampleResults).mockResolvedValue({ results: [] });
    const budget = new ProbeBudget(1);
    await budget.probe("first query");
    const second = await budget.probe("second query");
    expect(second.skipped).toBe("budget");
  });
});

describe("probePairsByAxisValues", () => {
  it("samples values across pairs respecting the budget and reports picturableRatio per pair", async () => {
    vi.mocked(serp.fetchGoogleImageExampleResults).mockImplementation(async (q: string) => {
      // Pretend "footwear" + first-axis values yield real images, second-axis values yield none.
      if (/Material/i.test(q)) {
        return {
          results: [
            { link: "https://a/1", thumbnail: "https://a/1t", source: "a.com" },
            { link: "https://b/2", thumbnail: "https://b/2t", source: "b.com" },
          ],
        };
      }
      return { results: [] };
    });

    const pairs = [
      {
        primary: { label: "Material", values: ["leather", "rubber", "knit"] },
        secondary: { label: "Buzzword", values: ["asdfgh", "qwerty"] },
      },
    ];
    const budget = new ProbeBudget(20);
    const stats = await probePairsByAxisValues(pairs, "footwear", budget, {
      maxProbesPerPair: 6,
      concurrency: 3,
    });

    expect(stats).toHaveLength(1);
    const stat = stats[0];
    expect(stat.probedAny).toBe(true);
    expect(stat.primaryHits).toBeGreaterThan(0);
    expect(stat.secondaryHits).toBe(0);
    expect(stat.picturableRatio).toBeGreaterThan(0);
    expect(stat.picturableRatio).toBeLessThan(1);
  });

  it("marks pairs as unprobed when budget runs out before reaching them", async () => {
    vi.mocked(serp.fetchGoogleImageExampleResults).mockResolvedValue({ results: [] });

    const pairs = [
      {
        primary: { label: "A", values: ["a1", "a2"] },
        secondary: { label: "B", values: ["b1", "b2"] },
      },
      {
        primary: { label: "C", values: ["c1", "c2"] },
        secondary: { label: "D", values: ["d1", "d2"] },
      },
    ];
    const budget = new ProbeBudget(2);
    const stats = await probePairsByAxisValues(pairs, "topic", budget, {
      maxProbesPerPair: 4,
      concurrency: 1,
    });

    // Sequential concurrency=1 + budget=2 => only first pair gets probed; second is unprobed.
    expect(stats[0].probedAny).toBe(true);
    expect(stats[1].probedAny).toBe(false);
  });
});
