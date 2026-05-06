import { cn } from "@/lib/utils";

export function AnimatedSparkles({ className }: { className?: string }) {
  return (
    <svg
      className={cn("shrink-0", className)}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <g opacity="0.1" strokeWidth="0" fill="currentColor">
        <circle cx="12" cy="12" r="7.8">
          <animate
            attributeName="r"
            values="7.2;8.8;7.2"
            dur="5.2s"
            repeatCount="indefinite"
            calcMode="spline"
            keySplines="0.45 0 0.2 1; 0.45 0 0.2 1"
          />
          <animate
            attributeName="opacity"
            values="0.04;0.12;0.04"
            dur="5.2s"
            repeatCount="indefinite"
            calcMode="spline"
            keySplines="0.45 0 0.2 1; 0.45 0 0.2 1"
          />
        </circle>
      </g>

      <g>
        <animateTransform
          attributeName="transform"
          type="rotate"
          values="-3 12 12; 3 12 12; -3 12 12"
          dur="5.2s"
          repeatCount="indefinite"
          calcMode="spline"
          keySplines="0.45 0 0.2 1; 0.45 0 0.2 1"
        />
        <path d="M10.2 14.9A2.15 2.15 0 0 0 8.7 13.4l-5.35-1.35a.54.54 0 0 1 0-1.05L8.7 9.66a2.15 2.15 0 0 0 1.5-1.5l1.35-5.34a.54.54 0 0 1 1.05 0l1.35 5.34a2.15 2.15 0 0 0 1.5 1.5L20.8 11a.54.54 0 0 1 0 1.05l-5.35 1.35a2.15 2.15 0 0 0-1.5 1.5l-1.35 5.35a.54.54 0 0 1-1.05 0z">
          <animate
            attributeName="opacity"
            values="0.78;1;0.78"
            dur="5.2s"
            repeatCount="indefinite"
            calcMode="spline"
            keySplines="0.45 0 0.2 1; 0.45 0 0.2 1"
          />
        </path>
      </g>

      <path d="M20 3.5v3.1" strokeWidth="1.35">
        <animate
          attributeName="opacity"
          values="0.2;0.95;0.2"
          dur="3.4s"
          begin="0.15s"
          repeatCount="indefinite"
          calcMode="spline"
          keySplines="0.45 0 0.2 1; 0.45 0 0.2 1"
        />
      </path>
      <path d="M21.55 5.05h-3.1" strokeWidth="1.35">
        <animate
          attributeName="opacity"
          values="0.2;0.95;0.2"
          dur="3.4s"
          begin="0.15s"
          repeatCount="indefinite"
          calcMode="spline"
          keySplines="0.45 0 0.2 1; 0.45 0 0.2 1"
        />
      </path>
      <path d="M4.15 17.3v2.1" strokeWidth="1.25">
        <animate
          attributeName="opacity"
          values="0.85;0.18;0.85"
          dur="4.2s"
          begin="0.65s"
          repeatCount="indefinite"
          calcMode="spline"
          keySplines="0.45 0 0.2 1; 0.45 0 0.2 1"
        />
      </path>
      <path d="M5.2 18.35h-2.1" strokeWidth="1.25">
        <animate
          attributeName="opacity"
          values="0.85;0.18;0.85"
          dur="4.2s"
          begin="0.65s"
          repeatCount="indefinite"
          calcMode="spline"
          keySplines="0.45 0 0.2 1; 0.45 0 0.2 1"
        />
      </path>
    </svg>
  );
}
