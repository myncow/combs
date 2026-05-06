/**
 * Shared motion vocabulary. Every framer-motion call site and any new CSS
 * keyframe should pick from these — keeps timings consistent across the app
 * and makes a future re-tune a one-file edit.
 *
 * Easings:
 *   - `out`    Material standard ease-out. Default for entries / reveals.
 *   - `inOut`  Symmetrical curve for sustained loops (breath, shimmer).
 *   - `drawer` Slow-out used by the cell drawer and other large surfaces.
 *
 * Durations (seconds, mirrored as `*Ms` in milliseconds for CSS strings):
 *   - `micro` 0.18  Hover, button color/border swaps.
 *   - `short` 0.24  Small element entries (cells, pills, dots).
 *   - `base`  0.32  Text reveals, image fades, banner enter/exit.
 *   - `long`  0.45  Progress bars, status banners, page swaps.
 *   - `page`  0.5   Title crossfades, drawer slide-in.
 *
 * `reduce(reduceMotion, transition)` zeroes out a transition for users who
 * prefer reduced motion — pass it any framer-motion `transition` object.
 */

export const MOTION_EASE = {
  out: [0.4, 0, 0.2, 1] as const,
  inOut: [0.4, 0, 0.6, 1] as const,
  drawer: [0.2, 0.7, 0.25, 1] as const,
};

export const MOTION_DURATION = {
  micro: 0.18,
  short: 0.24,
  base: 0.32,
  long: 0.45,
  page: 0.5,
};

export const MOTION_DURATION_MS = {
  micro: 180,
  short: 240,
  base: 320,
  long: 450,
  page: 500,
};

/** CSS-string variants for use in template literals / inline styles. */
export const MOTION_CSS = {
  easeOut: "cubic-bezier(0.4, 0, 0.2, 1)",
  easeInOut: "cubic-bezier(0.4, 0, 0.6, 1)",
  drawer: "cubic-bezier(0.2, 0.7, 0.25, 1)",
};

export type MotionTransition = {
  duration?: number;
  ease?: readonly number[] | string;
  delay?: number;
};

/** Zero-out a transition under reduced-motion preference. */
export function reduceTransition<T extends MotionTransition | undefined>(
  reduceMotion: boolean,
  transition: T,
): T | { duration: 0 } {
  if (!reduceMotion) return transition;
  return { duration: 0 };
}

/** Default entry transition: short fade with the standard ease-out. */
export function entryTransition(reduceMotion = false, delay = 0) {
  return reduceMotion
    ? { duration: 0 }
    : { duration: MOTION_DURATION.short, ease: MOTION_EASE.out, delay };
}

/** Default reveal transition: longer fade for text/banner/image reveals. */
export function revealTransition(reduceMotion = false, delay = 0) {
  return reduceMotion
    ? { duration: 0 }
    : { duration: MOTION_DURATION.base, ease: MOTION_EASE.out, delay };
}
