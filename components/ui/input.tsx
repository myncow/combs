import * as React from "react";
import { cn } from "@/lib/utils";

// Functional input — hairline underline, accent caret, no box.
const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={cn(
        "flex h-11 w-full min-w-0 bg-transparent px-0 py-2",
        "font-sans text-[15px] text-foreground",
        "border-0 border-b border-border/55",
        "caret-foreground/75",
        "placeholder:text-muted-foreground",
        "transition-opacity duration-150 ease-out",
        "focus:outline-none focus-visible:outline-none",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "[appearance:none] rounded-none",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";

export { Input };
