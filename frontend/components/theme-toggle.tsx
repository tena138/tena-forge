"use client";

import { Moon, Sun } from "lucide-react";

import { useTheme } from "@/components/theme-provider";
import { cn } from "@/lib/utils";

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { theme, toggleTheme } = useTheme();
  const isLight = theme === "light";

  return (
    <button
      type="button"
      className={cn(
        "inline-flex h-9 shrink-0 items-center gap-2 rounded-[8px] border border-white/10 bg-white/[0.055] px-2.5 text-xs font-semibold text-slate-300 shadow-sm transition-all hover:border-white/18 hover:bg-white/[0.08] hover:text-white",
        "theme-toggle-button"
      )}
      onClick={toggleTheme}
      aria-label={isLight ? "다크 모드로 전환" : "라이트 모드로 전환"}
      title={isLight ? "다크 모드" : "라이트 모드"}
    >
      {isLight ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
      {!compact && <span className="hidden sm:inline">{isLight ? "Dark" : "Light"}</span>}
    </button>
  );
}

