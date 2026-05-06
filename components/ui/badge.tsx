import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// Mono marker chip — hairline, uppercase, tracked. No pill radii.
const badgeVariants = cva(
  [
    "inline-flex items-center border px-2 py-[3px]",
    "font-mono text-[11px] font-medium uppercase tracking-[0.18em]",
    "rounded-none",
  ].join(" "),
  {
    variants: {
      variant: {
        default: "border-foreground bg-foreground text-background",
        outline: "border-foreground/70 bg-transparent text-foreground",
        muted: "border-border bg-transparent text-muted-foreground",
        accent: "border-primary bg-primary text-primary-foreground",
      },
    },
    defaultVariants: {
      variant: "outline",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
