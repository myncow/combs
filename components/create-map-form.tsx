"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, ChevronRight, Loader2, Lock, RefreshCw, Unlock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { axisPairKey } from "@/components/axis-pair-suggestion-card";
import { ResponsiveAxesSlot } from "@/components/responsive-axes-slot";
import { SoftWaitPanel, type StepRow } from "@/components/soft-wait-panel";
import { LoadingSpinner } from "@/components/loading-spinner";
import { AxisVisualGuide } from "@/components/axis-visual-guide";
import type { GenerationTraceEvent } from "@/lib/generation-stream";
import type { SuggestAxisPairInput } from "@/lib/schema";

/** Short examples for rotating placeholder (empty field, not focused). Visual, axis-friendly hints. */
const ROTATING_PLACEHOLDERS = [
  "Running shoes — midsole stack × upper weave window…",
  "Street trees — winter silhouette × bark plate texture…",
  "Espresso bars — counter stance × chrome highlight mood…",
  "Sliced loaves — crumb openness × crust leopard band…",
  "Studio chairs — frame material × leg topology under seat…",
  "Halved fruit — chamber layout × juice vs dry rim…",
  "Ceramic mugs — clay body tone × glaze pool topography…",
  "Vintage lenses — mount flange cue × front element dome…",
  "Ramen bowls — broth clarity × noodle cross-profile…",
  "Wristwear — case finish grain × handset geometry…",
  "Knife profiles — spine belly curve × bolster transition…",
  "Sunglass fronts — rim thickness × tint cast on white…",
  "Swatches under raking light — weave float × fiber sheen…",
  "Night cocktails — glass silhouette × foam or garnish plane…",
];

/** Shown while the topic field is empty and focused (avoids fixing on one rotating sample). */
const TOPIC_FOCUS_PLACEHOLDER =
  "Name a category or scene—axis ideas load after a couple of characters.";

const SUGGEST_DEBOUNCE_MS = 420;

/** Per-letter delay spreads (ms), Algolia-style, for a natural typing rhythm. */
const PLACEHOLDER_TYPE_MS_MIN = 50;
const PLACEHOLDER_TYPE_MS_MAX = 90;
const PLACEHOLDER_DELETE_MS_MIN = 28;
const PLACEHOLDER_DELETE_MS_MAX = 52;
const PLACEHOLDER_PAUSE_MS_MIN = 2200;
const PLACEHOLDER_PAUSE_MS_MAX = 3200;

function randomIntInclusive(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickNextPhraseIdx(exclude: number, len: number): number {
  if (len <= 1) {
    return 0;
  }
  let next = exclude;
  while (next === exclude) {
    next = Math.floor(Math.random() * len);
  }
  return next;
}

function stepLabel(step: string, detail?: string): string {
  switch (step) {
    case "normalize_brief":
      return "Framing the topic";
    case "research":
      return "Gathering grounded clues";
    case "skeleton":
      return "Sketching the grid";
    case "cells":
      return detail ? `Trying crossings — ${detail}` : "Trying crossings";
    case "post_process":
      return "Settling the map";
    default:
      if (step.startsWith("cells_batch_")) {
        const n = step.slice("cells_batch_".length);
        return n ? `Trying crossings (${n})` : "Trying crossings";
      }
      return "Warming up the draft";
  }
}

function upsertStep(rows: StepRow[], key: string, label: string, status: StepRow["status"]): StepRow[] {
  const i = rows.findIndex((r) => r.key === key);
  const next = { key, label, status };
  if (i === -1) {
    return [...rows, next];
  }
  const copy = [...rows];
  copy[i] = next;
  return copy;
}

async function* parseSseJson(body: ReadableStream<Uint8Array> | null): AsyncGenerator<GenerationTraceEvent> {
  if (!body) {
    return;
  }
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      buf += decoder.decode(value, { stream: true });
      const blocks = buf.split("\n\n");
      buf = blocks.pop() ?? "";
      for (const block of blocks) {
        for (const line of block.split("\n")) {
          const t = line.trim();
          if (!t.startsWith("data:")) {
            continue;
          }
          const json = t.slice(5).trim();
          if (!json || json === "[DONE]") {
            continue;
          }
          try {
            yield JSON.parse(json) as GenerationTraceEvent;
          } catch {
            continue;
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function buildSuggestCacheKey(topicTrim: string): string {
  return topicTrim.trim().toLowerCase();
}

const URL_PARAM_TOPIC = "topic";
const URL_PARAM_PAIR = "pair";

type DraftFromUrl = {
  topic: string;
  lockedPairKey: string | null;
};

function parseDraftFromUrl(search: URLSearchParams): DraftFromUrl {
  const topic = (search.get(URL_PARAM_TOPIC) ?? "").trim().slice(0, 120);
  const lockedPairKeyRaw = search.get(URL_PARAM_PAIR)?.trim() ?? "";
  const lockedPairKey = lockedPairKeyRaw.includes("::") ? lockedPairKeyRaw : null;

  return {
    topic,
    lockedPairKey,
  };
}

function buildDraftUrl(currentUrl: URL, draft: Pick<DraftFromUrl, "topic" | "lockedPairKey">) {
  const params = new URLSearchParams(currentUrl.search);
  const topic = draft.topic.trim();

  if (topic) {
    params.set(URL_PARAM_TOPIC, topic);
  } else {
    params.delete(URL_PARAM_TOPIC);
  }

  if (draft.lockedPairKey) {
    params.set(URL_PARAM_PAIR, draft.lockedPairKey);
  } else {
    params.delete(URL_PARAM_PAIR);
  }

  params.delete("suggestions");

  const nextSearch = params.toString();
  return `${currentUrl.pathname}${nextSearch ? `?${nextSearch}` : ""}`;
}

export function CreateMapForm() {
  const [topic, setTopic] = useState("");
  const [topicFocused, setTopicFocused] = useState(false);
  const [animatedPlaceholder, setAnimatedPlaceholder] = useState("");
  const [pairs, setPairs] = useState<SuggestAxisPairInput[]>([]);
  const [lockedPair, setLockedPair] = useState<SuggestAxisPairInput | null>(null);
  const [requestedLockedPairKey, setRequestedLockedPairKey] = useState<string | null>(null);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [suggestErr, setSuggestErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [steps, setSteps] = useState<StepRow[]>([]);
  const [reasoning, setReasoning] = useState("");
  const [output, setOutput] = useState("");
  const [usageLines, setUsageLines] = useState<string[]>([]);
  const router = useRouter();
  const suggestSeq = useRef(0);
  const hasMounted = useRef(false);
  const topicTrimRef = useRef("");
  const requestedLockedPairKeyRef = useRef<string | null>(null);
  const lastFetchedSuggestKeyRef = useRef<string | null>(null);
  const pendingSuggestKeyRef = useRef<string | null>(null);

  const topicTrim = topic.trim();
  const hasDraft = topicTrim !== "" || lockedPair !== null || requestedLockedPairKey !== null;

  useEffect(() => {
    const syncDraftFromLocation = () => {
      const draft = parseDraftFromUrl(new URLSearchParams(window.location.search));
      suggestSeq.current += 1;
      lastFetchedSuggestKeyRef.current = null;
      pendingSuggestKeyRef.current = null;
      setTopic(draft.topic);
      setPairs([]);
      setLockedPair(null);
      setRequestedLockedPairKey(draft.lockedPairKey);
      setSuggestErr(null);
      setSuggestLoading(false);
    };

    syncDraftFromLocation();
    window.addEventListener("popstate", syncDraftFromLocation);
    return () => window.removeEventListener("popstate", syncDraftFromLocation);
  }, []);

  useEffect(() => {
    if (!hasMounted.current) {
      hasMounted.current = true;
      return;
    }

    const currentUrl = new URL(window.location.href);
    const nextUrl = buildDraftUrl(currentUrl, {
      topic,
      lockedPairKey: requestedLockedPairKey,
    });
    const currentPath = `${currentUrl.pathname}${currentUrl.search}`;
    if (nextUrl !== currentPath) {
      window.history.replaceState(window.history.state, "", nextUrl);
    }
  }, [requestedLockedPairKey, topic]);

  useEffect(() => {
    if (!busy && !hasDraft) {
      return;
    }
    const onUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, [busy, hasDraft]);

  useEffect(() => {
    topicTrimRef.current = topicTrim;
    requestedLockedPairKeyRef.current = requestedLockedPairKey;
  }, [requestedLockedPairKey, topicTrim]);

  useEffect(() => {
    if (topic !== "" || topicFocused) {
      return;
    }

    let cancelled = false;
    let rafId = 0;
    const phrases = ROTATING_PLACEHOLDERS;
    let phraseIdx = Math.floor(Math.random() * phrases.length);
    let charIdx = 0;
    let mode: "type" | "pause" | "delete" = "type";
    let pauseUntil = 0;
    let nextStepAt = performance.now() + randomIntInclusive(PLACEHOLDER_TYPE_MS_MIN, PLACEHOLDER_TYPE_MS_MAX);

    const tick = () => {
      if (cancelled) {
        return;
      }
      const now = performance.now();
      const full = phrases[phraseIdx] ?? "";

      if (mode === "type") {
        if (now >= nextStepAt) {
          if (charIdx < full.length) {
            charIdx += 1;
            setAnimatedPlaceholder(full.slice(0, charIdx));
            nextStepAt = now + randomIntInclusive(PLACEHOLDER_TYPE_MS_MIN, PLACEHOLDER_TYPE_MS_MAX);
          } else {
            mode = "pause";
            pauseUntil = now + randomIntInclusive(PLACEHOLDER_PAUSE_MS_MIN, PLACEHOLDER_PAUSE_MS_MAX);
          }
        }
      } else if (mode === "pause") {
        if (now >= pauseUntil) {
          mode = "delete";
          nextStepAt = now + randomIntInclusive(PLACEHOLDER_DELETE_MS_MIN, PLACEHOLDER_DELETE_MS_MAX);
        }
      } else if (mode === "delete") {
        if (now >= nextStepAt) {
          if (charIdx > 0) {
            charIdx -= 1;
            setAnimatedPlaceholder(full.slice(0, charIdx));
            nextStepAt = now + randomIntInclusive(PLACEHOLDER_DELETE_MS_MIN, PLACEHOLDER_DELETE_MS_MAX);
          } else {
            phraseIdx = pickNextPhraseIdx(phraseIdx, phrases.length);
            mode = "type";
            nextStepAt = now + randomIntInclusive(PLACEHOLDER_TYPE_MS_MIN, PLACEHOLDER_TYPE_MS_MAX);
          }
        }
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
    };
  }, [topic, topicFocused]);

  const executeSuggestFetch = useCallback(async (force: boolean) => {
    const t = topicTrimRef.current;
    if (t.length < 2) {
      return;
    }

    const key = buildSuggestCacheKey(t);
    if (!force && key === lastFetchedSuggestKeyRef.current) {
      return;
    }
    if (!force && pendingSuggestKeyRef.current === key) {
      return;
    }

    const seq = ++suggestSeq.current;
    pendingSuggestKeyRef.current = key;
    setSuggestLoading(true);
    setSuggestErr(null);
    try {
      const res = await fetch("/api/suggest-axis-pairs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: t }),
      });
      const data = (await res.json()) as { error?: string; pairs?: SuggestAxisPairInput[] };
      if (suggestSeq.current !== seq) {
        return;
      }
      if (!res.ok) {
        setSuggestErr(typeof data.error === "string" ? data.error : "Suggestions failed");
        setPairs([]);
        setLockedPair(null);
        return;
      }
      lastFetchedSuggestKeyRef.current = key;
      const next = Array.isArray(data.pairs) ? data.pairs : [];
      setPairs(next);
      const reqLock = requestedLockedPairKeyRef.current;
      if (reqLock) {
        const matchedPair = next.find((pair) => axisPairKey(pair) === reqLock) ?? null;
        setLockedPair(matchedPair);
        if (!matchedPair) {
          setRequestedLockedPairKey(null);
        }
        return;
      }
      setLockedPair(null);
    } catch {
      if (suggestSeq.current !== seq) {
        return;
      }
      setSuggestErr("Suggestions failed.");
      setPairs([]);
      setLockedPair(null);
    } finally {
      if (suggestSeq.current === seq) {
        pendingSuggestKeyRef.current = null;
        setSuggestLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (topicTrim.length < 2) {
      return;
    }
    const t = window.setTimeout(() => {
      void executeSuggestFetch(false);
    }, SUGGEST_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [topicTrim, executeSuggestFetch]);

  function togglePair(p: SuggestAxisPairInput) {
    const key = axisPairKey(p);
    setLockedPair((cur) => {
      const next = cur && axisPairKey(cur) === key ? null : p;
      return next;
    });
    setRequestedLockedPairKey((cur) => (cur === key ? null : key));
  }

  function buildGenerationPayload(topicStr: string) {
    const lock = lockedPair;
    let extra = "";
    if (lock) {
      const parts = [
        "[User-selected axis pair — use exactly these two map dimensions]",
        `Primary: "${lock.primary.label}" (key: ${lock.primary.key})${lock.primary.description ? ` — ${lock.primary.description}` : ""}`,
        lock.primary.values?.length ? `Primary draft values: ${lock.primary.values.join(" | ")}` : "",
        `Secondary: "${lock.secondary.label}" (key: ${lock.secondary.key})${lock.secondary.description ? ` — ${lock.secondary.description}` : ""}`,
        lock.secondary.values?.length ? `Secondary draft values: ${lock.secondary.values.join(" | ")}` : "",
        lock.rationale ? `Rationale: ${lock.rationale}` : "",
      ].filter(Boolean);
      extra = parts.join("\n");
    }

    return {
      topic: topicStr,
      extraContext: extra || undefined,
      candidateDimensions: lock ? [lock.primary.label.slice(0, 40), lock.secondary.label.slice(0, 40)] : [],
      inferDimensions: !lock,
      combines: lock ? `${lock.primary.label} × ${lock.secondary.label}`.slice(0, 180) : undefined,
    };
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const topicStr = topic.trim();
    if (topicStr.length < 2) {
      setError("Enter a topic (at least 2 characters).");
      return;
    }

    setBusy(true);
    setError(null);
    setSteps([]);
    setReasoning("");
    setOutput("");
    setUsageLines([]);

    try {
      const res = await fetch("/api/generate/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildGenerationPayload(topicStr)),
      });

      if (!res.ok && !res.headers.get("content-type")?.includes("text/event-stream")) {
        const j = await res.json().catch(() => null);
        setError(typeof j?.error === "string" ? j.error : `Request failed (${res.status})`);
        setBusy(false);
        return;
      }

      for await (const ev of parseSseJson(res.body)) {
        if (ev.type === "step") {
          const key = ev.detail ? `${ev.step}:${ev.detail}` : ev.step;
          const label = stepLabel(ev.step, ev.detail);
          setSteps((rows) =>
            upsertStep(rows, key, label, ev.phase === "start" ? "running" : "done"),
          );
        } else if (ev.type === "reasoning_delta") {
          setReasoning((r) => r + ev.text);
        } else if (ev.type === "output_delta") {
          setOutput((o) => o + ev.text);
        } else if (ev.type === "usage") {
          // Omit token/model telemetry from the primary UI
        } else if (ev.type === "research") {
          if (ev.phase === "end" && ev.sourcesFound != null) {
            const n = ev.sourcesFound;
            setUsageLines((lines) => [
              ...lines,
              n === 1 ? "Working from one grounded reference." : `Working from ${n} grounded references.`,
            ]);
          }
        } else if (ev.type === "error") {
          setError(ev.message);
          setBusy(false);
          return;
        } else if (ev.type === "complete") {
          router.push(`/maps/${ev.slug}`);
          setBusy(false);
          return;
        }
      }

      setBusy(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Stream failed.");
      setBusy(false);
    }
  }

  const canSuggest = topicTrim.length >= 2;
  const visiblePairs = pairs.slice(0, 2);
  const lockedPairShownInSuggestions =
    lockedPair !== null &&
    visiblePairs.some((p) => axisPairKey(p) === axisPairKey(lockedPair));
  const topicPlaceholder =
    topic !== "" ? "" : topicFocused ? TOPIC_FOCUS_PLACEHOLDER : animatedPlaceholder;

  const suggestLiveMessage =
    !canSuggest
      ? "Enter a topic to see suggested axis pairings."
      : suggestLoading
        ? "Sketching axis frames."
        : suggestErr
          ? "Suggestions could not load."
          : pairs.length === 0
            ? "No frames yet."
            : `${pairs.length} frames suggested.`;

  return (
    <form onSubmit={onSubmit} className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 md:overflow-hidden">
      <div className="grid min-h-0 flex-1 gap-3 md:grid-cols-[minmax(0,1.2fr)_minmax(24rem,0.9fr)] md:items-stretch md:overflow-y-auto md:pr-1 xl:grid-cols-[minmax(0,1.35fr)_minmax(30rem,0.95fr)]">
        <section className="flex min-h-0 min-w-0 flex-col border border-border bg-card/35">
          <div className="flex items-start justify-between gap-3 border-b border-border px-3 py-2.5">
            <div>
              <p className="font-mono text-[10px] font-medium uppercase leading-none tracking-[0.22em] text-foreground/80">
                1. Define Input
              </p>
              <p className="mt-1.5 text-[13px] leading-snug text-muted-foreground">
                Enter a topic and choose the axes that shape the generated table.
              </p>
            </div>
            <span className="shrink-0 border border-border bg-background px-1.5 py-0.5 font-mono text-[9px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Source
            </span>
          </div>

          <div className="flex min-h-0 flex-col gap-4 px-3 py-3">
            <div className="shrink-0 space-y-3">
              <div className="flex items-baseline justify-between gap-3">
                <label
                  htmlFor="create-map-topic"
                  className="font-mono text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground"
                >
                  Topic
                </label>
              </div>
              <Input
                id="create-map-topic"
                name="topic"
                required
                autoComplete="off"
                spellCheck={false}
                value={topic}
                onFocus={() => setTopicFocused(true)}
                onBlur={() => setTopicFocused(false)}
                onChange={(e) => {
                  const v = e.target.value;
                  const nextTrim = v.trim();
                  const prevTrim = topicTrim;
                  setTopic(v);
                  if (nextTrim !== prevTrim) {
                    lastFetchedSuggestKeyRef.current = null;
                    pendingSuggestKeyRef.current = null;
                    setPairs([]);
                    setLockedPair(null);
                    setRequestedLockedPairKey(null);
                  }
                  if (nextTrim.length < 2) {
                    lastFetchedSuggestKeyRef.current = null;
                    pendingSuggestKeyRef.current = null;
                    setSuggestErr(null);
                    setSuggestLoading(false);
                  }
                }}
                placeholder={topicPlaceholder}
                className={
                  "min-h-[3rem] border-border/55 bg-transparent py-1 pb-1.5 font-semibold leading-[1.2] tracking-[-0.035em] text-foreground " +
                  "placeholder-shown:font-medium placeholder-shown:tracking-[-0.022em] " +
                  "placeholder:font-normal placeholder:italic placeholder:tracking-[-0.02em] placeholder:text-muted-foreground/48 " +
                  "text-[clamp(1.25rem,4.2vw,1.55rem)] md:min-h-[3.35rem] md:text-[clamp(1.35rem,3.8vw,1.65rem)]"
                }
              />
            </div>

            <ResponsiveAxesSlot>
              <div className="flex items-center justify-between gap-2">
                <p className="font-mono text-[9px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
                  Axis Suggestions
                </p>
                {pairs.length > visiblePairs.length ? (
                  <button
                    type="button"
                    onClick={() => void executeSuggestFetch(true)}
                    className="text-[12px] text-muted-foreground underline decoration-border underline-offset-4 transition-colors hover:text-foreground"
                  >
                    Show two more
                  </button>
                ) : null}
              </div>

              <div aria-live="polite" aria-busy={suggestLoading} className="min-h-[3rem] space-y-2">
                <p className="sr-only" role="status">
                  {suggestLiveMessage}
                </p>

                {!canSuggest ? null : suggestLoading ? (
                  <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin opacity-70" aria-hidden />
                    Sketching frames…
                  </p>
                ) : suggestErr ? (
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <p className="text-[13px] text-destructive">{suggestErr}</p>
                    <button
                      type="button"
                      onClick={() => void executeSuggestFetch(true)}
                      className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground underline decoration-border underline-offset-4 hover:text-foreground"
                    >
                      <RefreshCw className="h-3 w-3" aria-hidden />
                      Retry
                    </button>
                  </div>
                ) : pairs.length === 0 ? (
                  <p className="text-[13px] text-muted-foreground">Keep typing — frames appear automatically.</p>
                ) : (
                  <ul className="space-y-1">
                    {visiblePairs.map((pair) => {
                      const selected = lockedPair !== null && axisPairKey(lockedPair) === axisPairKey(pair);
                      return (
                        <li key={axisPairKey(pair)}>
                          <button
                            type="button"
                            onClick={() => togglePair(pair)}
                            aria-pressed={selected}
                            aria-label={
                              selected
                                ? `Selected frame ${pair.primary.label} by ${pair.secondary.label}`
                                : `Select frame ${pair.primary.label} by ${pair.secondary.label}`
                            }
                            className={
                              "group w-full border border-transparent px-2 py-1.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring " +
                              (selected
                                ? "border-primary/40 bg-[color:color-mix(in_srgb,var(--primary)_7%,transparent)]"
                                : "hover:border-border hover:bg-foreground/[0.025]")
                            }
                          >
                            <span className="text-[15px] font-medium leading-snug tracking-[-0.02em] text-foreground">
                              {pair.primary.label}
                              <span className="mx-1.5 font-normal text-muted-foreground">×</span>
                              {pair.secondary.label}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </ResponsiveAxesSlot>

            {lockedPair && !lockedPairShownInSuggestions ? (
              <div className="flex shrink-0 items-center gap-2 py-1">
                <Lock className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />
                <p className="min-w-0 flex-1 truncate text-[14px] text-foreground/90">
                  {lockedPair.primary.label}
                  <span className="mx-1.5 text-muted-foreground">×</span>
                  {lockedPair.secondary.label}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setLockedPair(null);
                    setRequestedLockedPairKey(null);
                  }}
                  className="inline-flex shrink-0 items-center gap-1 text-[12px] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  aria-label="Clear locked frame"
                >
                  <Unlock className="h-3 w-3" aria-hidden />
                  Clear
                </button>
              </div>
            ) : null}

            {error ? (
              <p className="shrink-0 text-[13px] text-destructive" role="alert">
                {error}
              </p>
            ) : null}

            <Button type="submit" disabled={busy} size="lg" className="h-11 w-full shrink-0">
              {busy ? (
                <>
                  <LoadingSpinner className="h-4 w-4" />
                  Building map…
                </>
              ) : (
                <>
                  Build map
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </Button>
          </div>
        </section>

        <div className="min-w-0">
          <AxisVisualGuide 
            className="h-full w-full text-foreground"
            primaryLabel={lockedPair?.primary.label || pairs[0]?.primary.label}
            secondaryLabel={lockedPair?.secondary.label || pairs[0]?.secondary.label}
            primaryValues={lockedPair?.primary.values || pairs[0]?.primary.values}
            secondaryValues={lockedPair?.secondary.values || pairs[0]?.secondary.values}
          />
        </div>
      </div>

      {busy || steps.length > 0 ? <SoftWaitPanel busy={busy} steps={steps} usageLines={usageLines} /> : null}

      {(busy || steps.length > 0 || reasoning || output || usageLines.length > 0) && (
        <details className="group/trace shrink-0 border-t border-border/70 pt-2">
          <summary className="flex cursor-pointer list-none items-center gap-2 py-1 text-[12px] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
            <ChevronRight className="h-3 w-3 shrink-0 transition-transform group-open/trace:rotate-90" aria-hidden />
            Trace
          </summary>
          <div className="space-y-3 py-2 text-[13px]">
            {steps.length > 0 ? (
              <div>
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Steps</p>
                <ul className="mt-1.5 space-y-1">
                  {steps.map((row) => (
                    <li
                      key={row.key}
                      className="flex items-start gap-2 text-[12px] leading-snug text-muted-foreground"
                    >
                      <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted-foreground/40" aria-hidden />
                      <span className={row.status === "running" ? "text-foreground/90" : ""}>{row.label}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {usageLines.length > 0 && (
              <div>
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Summary</p>
                <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-muted-foreground">
                  {usageLines.map((line, idx) => (
                    <li key={`${line}-${idx}`}>{line}</li>
                  ))}
                </ul>
              </div>
            )}
            {reasoning && (
              <div>
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Notes</p>
                <pre className="mt-1.5 max-h-32 overflow-auto whitespace-pre-wrap text-[12px] leading-relaxed text-foreground/85">
                  {reasoning}
                </pre>
              </div>
            )}
            {output && (
              <div>
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Structured output</p>
                <pre className="mt-1.5 max-h-36 overflow-auto whitespace-pre-wrap font-mono text-[12px] text-foreground/85">
                  {output}
                </pre>
              </div>
            )}
          </div>
        </details>
      )}
    </form>
  );
}
