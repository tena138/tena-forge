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
        variant === "default" && "border-0 bg-black text-white shadow-none",
        variant === "outline" && "border-0 bg-zinc-100 text-zinc-700",
        variant === "warning" && "border-0 bg-zinc-100 text-zinc-950 ring-0",
        variant === "error" && "border-0 bg-zinc-100 text-black ring-0",
        variant === "success" && "border-0 bg-zinc-100 text-zinc-950 ring-0",
        variant === "secondary" && "border-0 bg-zinc-100 text-zinc-700",
        className
      )}
      {...props}
    />
  );
}
