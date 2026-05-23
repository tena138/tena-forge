"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export function SidebarNavItem({
  href,
  label,
  icon: Icon,
  active,
  mobile = false,
  collapsed = false,
  activeClassName,
  activeIndicatorClassName,
  activeIconClassName,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
  mobile?: boolean;
  collapsed?: boolean;
  activeClassName?: string;
  activeIndicatorClassName?: string;
  activeIconClassName?: string;
}) {
  return (
    <Link
      href={href}
      title={collapsed && !mobile ? label : undefined}
      aria-label={collapsed && !mobile ? label : undefined}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative inline-flex items-center border text-sm font-medium transition-all duration-150",
        mobile
          ? "h-9 shrink-0 gap-2.5 rounded-[7px] border-white/10 bg-white/[0.04] px-3 text-slate-300 hover:border-white/18 hover:bg-white/[0.08] hover:text-white"
          : collapsed
            ? "mx-auto flex h-10 w-10 justify-center rounded-[8px] border-transparent px-0 text-slate-400 hover:border-white/10 hover:bg-white/[0.06] hover:text-white"
            : "flex h-10 w-full gap-2 rounded-[7px] border-transparent px-2.5 text-slate-400 hover:border-white/10 hover:bg-white/[0.06] hover:text-white hover:shadow-sm",
        active &&
          (activeClassName ||
            (mobile
              ? "border-violet-400/30 bg-violet-400/10 text-violet-100 hover:bg-violet-400/10 hover:text-violet-100"
              : "border-white/10 bg-white/[0.08] text-white shadow-[0_10px_28px_rgba(0,0,0,0.18)]"))
      )}
    >
      {!mobile && !collapsed && <span className={cn("absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-transparent transition-colors", active && (activeIndicatorClassName || "bg-violet-400"))} />}
      <Icon className={cn("h-4 w-4 shrink-0 text-slate-500 transition-colors group-hover:text-slate-200", active && (activeIconClassName || "text-violet-300 group-hover:text-violet-300"))} />
      {!collapsed && <span className="truncate">{label}</span>}
    </Link>
  );
}
