import { cn } from "@/lib/utils";

type Props = {
  name?: string | null;
  email?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
};

const SIZE_CLASS: Record<NonNullable<Props["size"]>, string> = {
  sm: "h-6 w-6 text-[10px]",
  md: "h-8 w-8 text-[12px]",
  lg: "h-12 w-12 text-[16px]",
};

function hashSeed(value: string): number {
  let h = 5381;
  for (let i = 0; i < value.length; i++) {
    h = ((h << 5) + h + value.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function pickInitial(name?: string | null, email?: string | null): string {
  const src = (name ?? email ?? "").trim();
  const ch = src.charAt(0);
  if (!ch) return "·";
  return ch.toUpperCase();
}

export function UserAvatar({ name, email, size = "md", className }: Props) {
  const seed = (email ?? name ?? "·").toLowerCase();
  // Hue space tuned to read well in both themes (avoid pure red/yellow which
  // collide with destructive / accent tokens).
  const hue = (hashSeed(seed) % 17) * 21;
  const initial = pickInitial(name, email);

  return (
    <span
      aria-hidden
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center border border-border-strong font-mono font-semibold uppercase leading-none tracking-normal",
        SIZE_CLASS[size],
        className,
      )}
      style={{
        backgroundColor: `oklch(0.32 0.07 ${hue})`,
        color: "#f7f7f3",
      }}
    >
      {initial}
      <span
        aria-hidden
        className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 border border-background bg-[color:var(--primary)]"
      />
    </span>
  );
}
