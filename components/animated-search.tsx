import { cn } from "@/lib/utils";

export function AnimatedSearch({ className }: { className?: string }) {
  return (
    <svg
      className={cn("shrink-0", className)}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="10.8" cy="10.8" r="8.15" fill="currentColor" opacity="0.06" stroke="none">
        <animate
          attributeName="opacity"
          values="0.04;0.1;0.04"
          dur="4.8s"
          repeatCount="indefinite"
          calcMode="spline"
          keySplines="0.45 0 0.2 1; 0.45 0 0.2 1"
        />
      </circle>

      <circle cx="10.8" cy="10.8" r="7.1" opacity="0.84">
        <animate
          attributeName="r"
          values="6.85;7.25;6.85"
          dur="4.8s"
          repeatCount="indefinite"
          calcMode="spline"
          keySplines="0.45 0 0.2 1; 0.45 0 0.2 1"
        />
        <animate
          attributeName="opacity"
          values="0.76;1;0.76"
          dur="4.8s"
          repeatCount="indefinite"
          calcMode="spline"
          keySplines="0.45 0 0.2 1; 0.45 0 0.2 1"
        />
      </circle>

      <circle cx="10.8" cy="10.8" r="8.15" strokeWidth="0.8" strokeDasharray="9 38" opacity="0.42">
        <animateTransform
          attributeName="transform"
          type="rotate"
          values="0 10.8 10.8; 360 10.8 10.8"
          dur="5.6s"
          repeatCount="indefinite"
        />
        <animate
          attributeName="opacity"
          values="0.24;0.55;0.24"
          dur="5.6s"
          repeatCount="indefinite"
          calcMode="spline"
          keySplines="0.45 0 0.2 1; 0.45 0 0.2 1"
        />
      </circle>

      <g opacity="0.54">
        <path d="M6.75 10.35h8.1" strokeWidth="0.95">
          <animateTransform
            attributeName="transform"
            type="translate"
            values="0 -2.35; 0 2.35; 0 -2.35"
            dur="3.6s"
            repeatCount="indefinite"
            calcMode="spline"
            keySplines="0.45 0 0.2 1; 0.45 0 0.2 1"
          />
          <animate
            attributeName="opacity"
            values="0;0.58;0"
            dur="3.6s"
            repeatCount="indefinite"
            calcMode="spline"
            keySplines="0.45 0 0.2 1; 0.45 0 0.2 1"
          />
        </path>
        <path d="M8.25 7.85c1.2-.8 2.85-1 4.35-.45" strokeWidth="0.9" opacity="0.52">
          <animate
            attributeName="opacity"
            values="0.22;0.68;0.22"
            dur="4.8s"
            repeatCount="indefinite"
            calcMode="spline"
            keySplines="0.45 0 0.2 1; 0.45 0 0.2 1"
          />
        </path>
      </g>

      <line x1="20.2" y1="20.2" x2="16.05" y2="16.05" opacity="0.9">
        <animateTransform
          attributeName="transform"
          type="translate"
          values="-0.18 -0.18; 0.18 0.18; -0.18 -0.18"
          dur="4.8s"
          repeatCount="indefinite"
          calcMode="spline"
          keySplines="0.45 0 0.2 1; 0.45 0 0.2 1"
        />
      </line>

      <circle cx="18.2" cy="7.15" r="0.7" fill="currentColor" stroke="none">
        <animate
          attributeName="opacity"
          values="0;0.72;0"
          dur="4.8s"
          begin="0.7s"
          repeatCount="indefinite"
          calcMode="spline"
          keySplines="0.45 0 0.2 1; 0.45 0 0.2 1"
        />
      </circle>
    </svg>
  );
}
