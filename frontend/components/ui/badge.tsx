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
        variant === "default" && "border border-white/70 bg-primary text-primary-foreground shadow-sm",
        variant === "outline" && "border border-white/12 bg-white/[0.04] text-slate-300",
        variant === "warning" && "border border-white/24 bg-white/[0.08] text-zinc-100 ring-1 ring-white/10",
        variant === "error" && "border border-white/30 bg-white/[0.045] text-white ring-1 ring-white/20",
        variant === "success" && "border border-white/18 bg-white/[0.10] text-zinc-100 ring-1 ring-white/10",
        variant === "secondary" && "bg-white/[0.07] text-slate-300 ring-1 ring-white/10",
        className
      )}
      {...props}
    />
  );
}
