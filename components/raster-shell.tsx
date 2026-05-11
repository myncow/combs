import { cn } from "@/lib/utils";

type ShellPageSize = "narrow" | "content" | "detail" | "wide" | "full";

const shellPageWidths: Record<ShellPageSize, string> = {
  narrow: "max-w-[760px]",
  content: "max-w-[980px]",
  detail: "max-w-[1180px]",
  wide: "max-w-[1240px]",
  full: "max-w-[1536px]",
};

export function ShellPage({
  children,
  size = "content",
  className,
}: {
  children: React.ReactNode;
  size?: ShellPageSize;
  className?: string;
}) {
  return (
    <main
      className={cn(
        "mx-auto flex min-h-0 w-full flex-1 flex-col overflow-y-auto overscroll-contain px-5 py-6 md:mx-0 md:mr-auto md:px-8 md:py-8",
        shellPageWidths[size],
        className,
      )}
    >
      {children}
    </main>
  );
}

export function PageHeader({
  title,
  eyebrow,
  intro,
  summary,
  index = "01",
  actions,
  className,
  titleClassName,
  introClassName,
}: {
  title: React.ReactNode;
  eyebrow?: React.ReactNode;
  intro?: React.ReactNode;
  summary?: React.ReactNode;
  index?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  titleClassName?: string;
  introClassName?: string;
}) {
  return (
    <header className={cn("border-b border-border pb-5 md:pb-6", className)}>
      <div className="flex items-baseline gap-3">
        <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-primary tabular-nums">
          {index}
        </span>
        <span aria-hidden className="h-px flex-1 bg-border" />
        {eyebrow ? (
          <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
            {eyebrow}
          </span>
        ) : null}
      </div>
      <h1
        className={cn(
          "mt-4 font-sans text-[28px] font-semibold leading-[1.02] tracking-[-0.03em] text-foreground md:text-[36px]",
          titleClassName,
        )}
      >
        {title}
      </h1>
      {intro ? (
        <p className={cn("mt-3 max-w-3xl text-[15px] leading-[1.6] text-muted-foreground", introClassName)}>
          {intro}
        </p>
      ) : null}
      {summary ? (
        <p className="mt-3 max-w-3xl font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          {summary}
        </p>
      ) : null}
      {actions ? <div className="mt-5 flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function SurfacePanel({
  children,
  className,
  padded = true,
  tone = "card",
}: {
  children: React.ReactNode;
  className?: string;
  padded?: boolean;
  tone?: "card" | "muted" | "background";
}) {
  return (
    <section
      className={cn(
        "border border-border",
        tone === "card" && "bg-card/85",
        tone === "muted" && "bg-[color:color-mix(in_srgb,var(--muted)_22%,var(--background))]",
        tone === "background" && "bg-background/70",
        padded && "px-5 py-5 md:px-6 md:py-6",
        className,
      )}
    >
      {children}
    </section>
  );
}

export function EmptyStatePanel({
  kicker,
  title,
  body,
  actions,
  className,
}: {
  kicker: React.ReactNode;
  title?: React.ReactNode;
  body?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <SurfacePanel className={cn("text-center", className)}>
      <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">{kicker}</p>
      {title ? (
        <h2 className="mt-3 font-sans text-[22px] font-semibold leading-tight tracking-[-0.02em] text-foreground">
          {title}
        </h2>
      ) : null}
      {body ? <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">{body}</p> : null}
      {actions ? <div className="mt-6 flex flex-wrap items-center justify-center gap-3">{actions}</div> : null}
    </SurfacePanel>
  );
}

export function MenuPanel({
  children,
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("border border-border bg-card", className)} {...props}>
      {children}
    </div>
  );
}
