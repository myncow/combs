import * as React from "react";
import { cn } from "@/lib/utils";

const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<"textarea">>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        "flex min-h-24 w-full bg-transparent px-0 py-2",
        "font-sans text-[15px] leading-[1.55] text-foreground",
        "border-0 border-b border-input",
        "caret-[color:var(--primary)]",
        "placeholder:text-muted-foreground",
        "transition-[border-color,opacity] duration-150 ease-out",
        "focus:outline-none focus:border-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "resize-none rounded-none",
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = "Textarea";

export { Textarea };
