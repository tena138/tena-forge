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
          variant === "default" && "border border-violet-400/40 bg-primary text-primary-foreground shadow-[0_10px_28px_rgba(124,58,237,0.28)] hover:bg-primary/90 hover:shadow-[0_14px_34px_rgba(124,58,237,0.34)]",
          variant === "outline" && "border border-white/12 bg-white/[0.04] text-slate-100 shadow-sm hover:border-white/20 hover:bg-white/[0.08]",
          variant === "secondary" && "border border-white/10 bg-white/[0.07] text-slate-100 hover:bg-white/[0.11]",
          variant === "ghost" && "text-slate-300 hover:bg-white/[0.07] hover:text-white",
          variant === "destructive" && "border border-red-600/20 bg-destructive text-destructive-foreground shadow-sm hover:opacity-90",
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
