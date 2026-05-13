import { cn } from "@/lib/utils";

type IconProps = {
  className?: string;
  title?: string;
};

/**
 * Pixel-grid status mark — echoes the Raster logo. A 3×3 graphite frame with a
 * primary-tinted center cell plus a check shaft drawn in pixels.
 */
export function SignedInIcon({ className, title }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      shapeRendering="crispEdges"
      role={title ? "img" : "presentation"}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      className={cn("shrink-0", className)}
    >
      {/* hairline frame */}
      <path
        d="M2 2 H22 V22 H2 Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
      {/* check pixels — staircase up-right */}
      <rect x="6" y="12" width="3" height="3" fill="var(--primary)" />
      <rect x="9" y="14" width="3" height="3" fill="var(--primary)" />
      <rect x="12" y="11" width="3" height="3" fill="var(--primary)" />
      <rect x="15" y="8" width="3" height="3" fill="var(--primary)" />
    </svg>
  );
}

/**
 * Pixel padlock — a clipped shackle over a stout body. Body has a primary
 * accent pixel for the keyhole so the icon reads as "ready to unlock" rather
 * than purely closed.
 */
export function SignedOutIcon({ className, title }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      shapeRendering="crispEdges"
      role={title ? "img" : "presentation"}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      className={cn("shrink-0", className)}
    >
      {/* shackle */}
      <path
        d="M8 10 V7 a4 4 0 0 1 8 0 V10"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
      {/* body frame */}
      <path
        d="M5 11 H19 V21 H5 Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
      {/* keyhole accent */}
      <rect x="11" y="14" width="2" height="4" fill="var(--primary)" />
    </svg>
  );
}

/**
 * Open padlock with a sparkle pixel — used for "what unlocks" nudges.
 */
export function UnlockHintIcon({ className, title }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      shapeRendering="crispEdges"
      role={title ? "img" : "presentation"}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      className={cn("shrink-0", className)}
    >
      {/* shackle pivoted open */}
      <path
        d="M8 10 V7 a4 4 0 0 1 7.4 -2"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
      {/* body frame */}
      <path
        d="M5 11 H19 V21 H5 Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
      {/* spark pixel */}
      <rect x="11" y="14" width="2" height="2" fill="var(--primary)" />
      <rect x="11" y="17" width="2" height="2" fill="var(--primary)" />
    </svg>
  );
}
