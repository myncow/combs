"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Lock, RefreshCw, Unlock } from "lucide-react";
import { AxisPairSuggestionCard } from "@/components/axis-pair-suggestion-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { entryTransition } from "@/lib/motion";
import { axisPairKey } from "@/components/axis-pair-suggestion-card";
import { ResponsiveAxesSlot } from "@/components/responsive-axes-slot";
import { dispatchLibraryRefresh } from "@/lib/client-events";
import { authClient } from "@/lib/auth/client";
import { buildAuthRedirectHref } from "@/lib/auth/redirect";
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

function buildSuggestCacheKey(topicTrim: string): string {
  return topicTrim.trim().toLowerCase();
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
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
  const { data: session, isPending: authPending } = authClient.useSession();
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
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const suggestSeq = useRef(0);
  const hasMounted = useRef(false);
  const topicTrimRef = useRef("");
  const requestedLockedPairKeyRef = useRef<string | null>(null);
  const lastFetchedSuggestKeyRef = useRef<string | null>(null);
  const pendingSuggestKeyRef = useRef<string | null>(null);
  const suggestAbortRef = useRef<AbortController | null>(null);

  const topicTrim = topic.trim();
  const isSignedIn = Boolean(session?.user);
  const signInHref = buildAuthRedirectHref("/auth/sign-in", pathname, searchParams);
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
    return () => {
      suggestAbortRef.current?.abort();
    };
  }, []);

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
    if (authPending || !isSignedIn) {
      return;
    }

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
    suggestAbortRef.current?.abort();
    const controller = new AbortController();
    suggestAbortRef.current = controller;
    setSuggestLoading(true);
    setSuggestErr(null);
    try {
      const res = await fetch("/api/suggest-axis-pairs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: t }),
        signal: controller.signal,
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
    } catch (error) {
      if (suggestSeq.current !== seq) {
        return;
      }
      if (isAbortError(error)) {
        return;
      }
      setSuggestErr("Suggestions failed.");
      setPairs([]);
      setLockedPair(null);
    } finally {
      if (suggestAbortRef.current === controller) {
        suggestAbortRef.current = null;
      }
      if (suggestSeq.current === seq) {
        pendingSuggestKeyRef.current = null;
        setSuggestLoading(false);
      }
    }
  }, [authPending, isSignedIn]);

  useEffect(() => {
    if (authPending || !isSignedIn) {
      return;
    }
    if (topicTrim.length < 2) {
      return;
    }
    const t = window.setTimeout(() => {
      void executeSuggestFetch(false);
    }, SUGGEST_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [authPending, executeSuggestFetch, isSignedIn, topicTrim]);

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
    if (authPending) {
      return;
    }

    if (!isSignedIn) {
      router.push(signInHref);
      return;
    }

    const topicStr = topic.trim();
    if (topicStr.length < 2) {
      setError("Enter a topic (at least 2 characters).");
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/generate/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildGenerationPayload(topicStr)),
      });

      const payload = (await res.json().catch(() => null)) as
        | { slug?: string; error?: string }
        | null;

      if (res.status === 401) {
        router.push(signInHref);
        return;
      }

      if (!res.ok || !payload?.slug) {
        setError(
          payload?.error ?? `Request failed (${res.status})`,
        );
        setBusy(false);
        return;
      }

      dispatchLibraryRefresh();
      router.push(`/maps/${payload.slug}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start generation.");
      setBusy(false);
    }
  }

  const canSuggest = topicTrim.length >= 2;
  const visiblePairs = pairs.slice(0, 4);
  const lockedPairShownInSuggestions =
    lockedPair !== null &&
    visiblePairs.some((p) => axisPairKey(p) === axisPairKey(lockedPair));
  const topicPlaceholder =
    topic !== "" ? "" : topicFocused ? TOPIC_FOCUS_PLACEHOLDER : animatedPlaceholder;

  const suggestLiveMessage =
    authPending
      ? "Checking account status."
      : !isSignedIn
        ? "Suggestions unlock once you sign in."
        : !canSuggest
      ? "Enter a topic to see suggested axis pairings."
      : suggestLoading
        ? "Sketching axis frames."
        : suggestErr
          ? "Suggestions could not load."
          : pairs.length === 0
            ? "No frames yet."
            : `${pairs.length} frames suggested.`;

  return (
    <form onSubmit={onSubmit} className="flex min-w-0 flex-col">
      <section className="flex min-w-0 flex-col">
        <div className="flex flex-col gap-6 py-1 md:py-2">
          <div className="space-y-3 border-b border-border pb-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                Topic brief
              </p>
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                Start concrete, then widen if needed
              </p>
            </div>
            <Input
              id="create-map-topic"
              name="topic"
              required
              autoComplete="off"
              spellCheck={false}
              aria-label="Topic"
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
                "shrink-0 min-h-[3.35rem] border-0 bg-transparent rounded-none px-0 py-1 pb-0 font-semibold leading-[1.2] tracking-[-0.035em] text-foreground focus-visible:ring-0 " +
                "placeholder-shown:font-medium placeholder-shown:tracking-[-0.022em] " +
                "placeholder:font-normal placeholder:italic placeholder:tracking-[-0.02em] placeholder:text-muted-foreground/48 " +
                "text-[clamp(1.3rem,4vw,1.75rem)] md:min-h-[3.75rem] md:text-[clamp(1.45rem,3.4vw,1.95rem)]"
              }
            />
          </div>

          <ResponsiveAxesSlot>
            <div
              aria-live="polite"
              aria-busy={suggestLoading}
              className="min-h-[12.5rem] space-y-3 border-b border-border pb-6"
            >
              <p className="sr-only" role="status">
                {suggestLiveMessage}
              </p>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                  Suggested frames
                </p>
                <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                  Tap once to lock
                </p>
              </div>

              {authPending ? (
                <p className="text-[13px] text-muted-foreground">Checking your account…</p>
              ) : !isSignedIn ? (
                <p className="text-[13px] text-muted-foreground">
                  Suggested axes appear once you sign in. You can build a map either way.
                </p>
              ) : !canSuggest ? (
                <p className="text-[13px] text-muted-foreground">
                  Type a topic — suggested axis pairs appear here.
                </p>
              ) : suggestLoading ? (
                <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
                  <Spinner size="sm" className="opacity-70" />
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
                <p className="text-[13px] text-muted-foreground">Keep typing.</p>
              ) : (
                <ul className="grid auto-rows-fr gap-2 md:grid-cols-2">
                  {visiblePairs.map((pair) => {
                    const selected = lockedPair !== null && axisPairKey(lockedPair) === axisPairKey(pair);
                    return (
                      <li key={axisPairKey(pair)} className="flex">
                        <AxisPairSuggestionCard
                          pair={pair}
                          selected={selected}
                          onSelect={() => togglePair(pair)}
                        />
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </ResponsiveAxesSlot>

          {lockedPair && !lockedPairShownInSuggestions ? (
            <div className="flex shrink-0 items-center gap-2 border border-border/70 bg-background/55 px-3 py-2">
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

          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="min-h-[1.25rem]">
              {error ? (
                <p className="shrink-0 text-[13px] text-destructive" role="alert">
                  {error}
                </p>
              ) : (
                <p className="text-[13px] text-muted-foreground">
                  The first pass builds the map structure. Frontier visuals come later inside each cell.
                </p>
              )}
            </div>

            <Button
              type="submit"
              disabled={busy || authPending}
              size="lg"
              className="h-11 w-full shrink-0 md:w-auto md:min-w-44 md:self-end"
            >
              <AnimatePresence mode="wait" initial={false}>
                {busy ? (
                  <motion.span
                    key="busy"
                    className="flex items-center gap-2"
                    initial={{ opacity: 0, y: 2 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -2 }}
                    transition={entryTransition()}
                  >
                    <Spinner size="md" />
                    Building map…
                  </motion.span>
                ) : (
                  <motion.span
                    key="idle"
                    className="flex items-center gap-2"
                    initial={{ opacity: 0, y: 2 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -2 }}
                    transition={entryTransition()}
                  >
                    Build map
                    <ArrowRight className="h-4 w-4" />
                  </motion.span>
                )}
              </AnimatePresence>
            </Button>
          </div>
        </div>
      </section>
    </form>
  );
}
