import * as React from "react";

import { cn } from "@/lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => {
  const classNameString = typeof className === "string" ? className : "";
  const usesLegacyLightSurface = /(^|\s)bg-white(\s|$)/.test(classNameString);

  return (
    <input
      ref={ref}
      className={cn(
        "flex h-10 w-full rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-primary/70 focus-visible:ring-2 focus-visible:ring-ring/30",
        className,
        usesLegacyLightSurface && "border-slate-200 text-slate-900 placeholder:text-slate-400"
      )}
      {...props}
    />
  );
});
Input.displayName = "Input";
