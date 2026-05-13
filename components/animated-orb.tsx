import { cn } from "@/lib/utils";

export function AnimatedOrb({ className }: { className?: string }) {
  return (
    <svg
      className={cn("pointer-events-none absolute -right-8 top-0 h-24 w-24 blur-2xl", className)}
      viewBox="0 0 100 100"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <radialGradient id="orb-gradient" cx="50%" cy="50%" r="50%" fx="50%" fy="50%">
          <stop offset="0%" stopColor="#fde68a" stopOpacity="0.46" />
          <stop offset="50%" stopColor="#fb7185" stopOpacity="0.22" />
          <stop offset="72%" stopColor="transparent" stopOpacity="0" />
        </radialGradient>
      </defs>
      
      <circle cx="50" cy="50" r="50" fill="url(#orb-gradient)">
        <animate
          attributeName="r"
          values="45;50;45"
          dur="4s"
          repeatCount="indefinite"
          calcMode="spline"
          keySplines="0.4 0 0.2 1; 0.4 0 0.2 1"
        />
        <animate
          attributeName="opacity"
          values="0.8;1;0.8"
          dur="4s"
          repeatCount="indefinite"
          calcMode="spline"
          keySplines="0.4 0 0.2 1; 0.4 0 0.2 1"
        />
      </circle>
    </svg>
  );
}
