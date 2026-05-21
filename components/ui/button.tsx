import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  [
    "inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap",
    "border font-mono text-[12px] uppercase tracking-[0.22em] font-medium",
    "transition-[color,background-color,border-color,opacity] duration-150 ease-out",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    "disabled:pointer-events-none disabled:opacity-50",
    "rounded-none",
  ].join(" "),
  {
    variants: {
      variant: {
        // Primary: graphite inverse block (the standard action).
        default:
          "border-foreground bg-foreground text-background hover:bg-primary hover:border-primary hover:text-primary-foreground",
        // Commit: cobalt block — high-emphasis affirmative ("publish", "create").
        commit:
          "border-primary bg-primary text-primary-foreground hover:bg-foreground hover:border-foreground hover:text-background",
        // Destructive: muted russet — irreversible actions only.
        destructive:
          "border-destructive bg-destructive text-destructive-foreground hover:bg-foreground hover:border-foreground hover:text-background",
        // Outline: hairline frame on the page background.
        outline:
          "border-foreground/55 bg-transparent text-foreground hover:border-foreground hover:bg-foreground hover:text-background",
        // Secondary: quiet hairline, darker bg.
        secondary:
          "border-border bg-card text-foreground hover:border-border-strong hover:bg-card",
        // Ghost: no border, plain text, hairline underline on hover.
        ghost:
          "border-transparent bg-transparent text-muted-foreground hover:text-foreground hover:border-border-strong",
        // Link-style tertiary action — reads as a sentence.
        link:
          "border-transparent bg-transparent text-foreground normal-case tracking-normal font-sans text-[14px] hover:[border-bottom:1px_solid_currentColor] hover:pb-[1px]",
      },
      size: {
        // Touch-friendly on mobile (≥44px hit area via h-11), compact on md+
        // so dense admin/desktop layouts don't bloat.
        default: "h-11 px-4 md:h-10",
        sm: "h-10 px-3 text-[11px] md:h-8",
        lg: "h-11 px-5 text-[13px]",
        icon: "h-11 w-11 px-0 md:h-10 md:w-10",
        "icon-sm": "h-9 w-9 px-0 md:h-8 md:w-8",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size, className }))}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
