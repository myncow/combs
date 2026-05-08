import { cn } from "@/lib/utils";

type AsciiDividerVariant = "plain" | "ornament" | "label";

interface AsciiDividerProps {
  variant?: AsciiDividerVariant;
  label?: string;
  className?: string;
}

const FILL = "~".repeat(200);

export function AsciiDivider({
  variant = "ornament",
  label,
  className,
}: AsciiDividerProps) {
  const center =
    variant === "label" && label
      ? `~ ${label.toUpperCase()} ~`
      : variant === "ornament"
        ? "~*~"
        : null;

  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none flex w-full select-none items-center gap-2 py-2 font-mono text-[13px] leading-none text-muted-foreground",
        className,
      )}
    >
      <span className="flex-1 overflow-hidden whitespace-nowrap">{FILL}</span>
      {center ? (
        <span className="shrink-0 px-1 tracking-[0.22em] text-foreground/80">
          {center}
        </span>
      ) : null}
      <span className="flex-1 overflow-hidden whitespace-nowrap text-right">
        {FILL}
      </span>
    </div>
  );
}
