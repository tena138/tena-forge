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
  coAgentAnchor,
  coAgentActive = false,
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
  coAgentAnchor?: string;
  coAgentActive?: boolean;
}) {
  return (
    <Link
      href={href}
      data-coagent-anchor={coAgentAnchor}
      data-coagent-sidebar-item={coAgentAnchor ? "" : undefined}
      title={collapsed && !mobile ? label : undefined}
      aria-label={collapsed && !mobile ? label : undefined}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative inline-flex items-center overflow-visible border text-sm font-medium transition-all duration-150",
        mobile
          ? "h-9 shrink-0 gap-2.5 rounded-full border-black/10 bg-[#f3f3f3] px-3 text-zinc-700 hover:border-black/20 hover:bg-zinc-200 hover:text-zinc-950"
          : collapsed
            ? "mx-auto flex h-10 w-10 justify-center rounded-[8px] border-transparent px-0 text-zinc-500 hover:border-black/10 hover:bg-zinc-200 hover:text-zinc-950"
            : "flex h-10 w-full gap-2 rounded-[7px] border-transparent px-2.5 text-zinc-600 hover:border-black/10 hover:bg-zinc-200 hover:text-zinc-950",
        active &&
          !coAgentActive &&
          (activeClassName ||
            (mobile
              ? "console-nav-active border-black bg-black text-white hover:bg-black hover:text-white"
              : "console-nav-active border-black bg-black text-white")),
        coAgentActive && "coagent-nav-active border-violet-700 bg-violet-700 text-white shadow-none hover:border-violet-800 hover:bg-violet-800 hover:text-white"
      )}
    >
      {!mobile && !collapsed && <span className={cn("absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-transparent transition-colors", active && !coAgentActive && (activeIndicatorClassName || "bg-black"), coAgentActive && "bg-violet-700")} />}
      <span data-coagent-icon-shell className="relative z-[1] grid h-5 w-5 shrink-0 place-items-center">
        <Icon className={cn("h-4 w-4 shrink-0 text-zinc-500 transition-colors group-hover:text-zinc-950", active && !coAgentActive && (activeIconClassName || "text-white group-hover:text-white"), coAgentActive && "text-white group-hover:text-white")} />
      </span>
      {!collapsed && <span className="truncate">{label}</span>}
    </Link>
  );
}
