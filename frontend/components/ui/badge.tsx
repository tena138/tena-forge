import * as React from "react";

import { cn } from "@/lib/utils";

export function Badge({
  className,
  variant = "default",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { variant?: "default" | "outline" | "warning" | "secondary" | "error" | "success" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-[6px] px-2 py-0.5 text-xs font-semibold",
        variant === "default" && "bg-primary text-primary-foreground shadow-sm",
        variant === "outline" && "border border-white/12 bg-white/[0.04] text-slate-300",
        variant === "warning" && "bg-violet-400/12 text-violet-200 ring-1 ring-violet-400/25",
        variant === "error" && "bg-rose-400/12 text-rose-200 ring-1 ring-rose-400/25",
        variant === "success" && "bg-emerald-400/12 text-emerald-200 ring-1 ring-emerald-400/25",
        variant === "secondary" && "bg-white/[0.07] text-slate-300 ring-1 ring-white/10",
        className
      )}
      {...props}
    />
  );
}
