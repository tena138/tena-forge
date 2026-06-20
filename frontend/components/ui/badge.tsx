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
        variant === "default" && "border border-black bg-black text-white shadow-none",
        variant === "outline" && "border border-black/10 bg-white text-zinc-700",
        variant === "warning" && "border border-black/20 bg-zinc-100 text-zinc-950 ring-1 ring-black/5",
        variant === "error" && "border border-black/40 bg-white text-black ring-1 ring-black/10",
        variant === "success" && "border border-black/15 bg-zinc-100 text-zinc-950 ring-1 ring-black/5",
        variant === "secondary" && "border border-black/10 bg-zinc-100 text-zinc-700",
        className
      )}
      {...props}
    />
  );
}
