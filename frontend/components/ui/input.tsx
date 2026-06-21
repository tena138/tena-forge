import * as React from "react";

import { cn } from "@/lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => {
  const classNameString = typeof className === "string" ? className : "";
  const usesLegacyLightSurface = /(^|\s)bg-white(\s|$)/.test(classNameString);

  return (
    <input
      ref={ref}
      className={cn(
        "flex h-10 w-full rounded-[7px] border-0 bg-zinc-100 px-3 py-2 text-sm font-semibold text-zinc-950 outline-none transition-colors selection:bg-black selection:text-white placeholder:text-zinc-500 focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-black/10 disabled:cursor-not-allowed disabled:opacity-55",
        className,
        usesLegacyLightSurface && "text-slate-900 placeholder:text-slate-400"
      )}
      {...props}
    />
  );
});
Input.displayName = "Input";
