import * as React from "react";

import { cn } from "@/lib/utils";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "outline" | "secondary" | "ghost" | "destructive";
  size?: "default" | "sm" | "icon";
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center gap-2 rounded-[7px] text-sm font-semibold transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
          variant === "default" && "border border-black bg-black text-white shadow-none hover:bg-zinc-800",
          variant === "outline" && "border border-black/10 bg-white text-zinc-900 shadow-none hover:border-black/20 hover:bg-zinc-100",
          variant === "secondary" && "border border-black/10 bg-zinc-100 text-zinc-900 hover:bg-zinc-200",
          variant === "ghost" && "text-zinc-700 hover:bg-zinc-100 hover:text-zinc-950",
          variant === "destructive" && "border border-black bg-black text-white shadow-none hover:bg-zinc-800",
          size === "default" && "h-10 px-4 py-2",
          size === "sm" && "h-8 px-3",
          size === "icon" && "h-9 w-9",
          className
        )}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";
