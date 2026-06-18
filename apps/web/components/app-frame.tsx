"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Activity,
  Archive,
  CreditCard,
  FileText,
  FileUp,
  LayoutDashboard,
  LayoutTemplate,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Shield,
  Sparkles,
  Users
} from "lucide-react";
import { clsx } from "clsx";

const SIDEBAR_COLLAPSED_KEY = "tena-saas-sidebar-collapsed";

const sections = [
  {
    title: "Private Studio",
    accent: "bg-white/80",
    panel: "border-white/15 bg-white/[0.040]",
    header: "text-neutral-100",
    items: [
      { href: "/dashboard", label: "대시보드", icon: LayoutDashboard },
      { href: "/upload", label: "내 자료 아카이빙", icon: FileUp },
      { href: "/jobs", label: "처리 작업", icon: Sparkles },
      { href: "/archive", label: "문항 아카이브", icon: Archive },
      { href: "/templates", label: "템플릿", icon: LayoutTemplate },
      { href: "/outputs", label: "출력물", icon: Shield }
    ]
  },
  {
    title: "Business",
    accent: "bg-white/50",
    panel: "border-white/15 bg-white/[0.030]",
    header: "text-neutral-200",
    items: [
      { href: "/billing", label: "구독 및 사용량", icon: CreditCard },
      { href: "/settings/members", label: "팀 멤버", icon: Users },
      { href: "/settings/workspace", label: "워크스페이스", icon: Settings },
      { href: "/settings/security", label: "보안", icon: Shield }
    ]
  },
  {
    title: "Admin",
    accent: "bg-white/35",
    panel: "border-white/[0.12] bg-white/[0.035]",
    header: "text-neutral-300",
    items: [
      { href: "/admin", label: "운영 콘솔", icon: FileText },
      { href: "/admin/usage", label: "사용량 분석", icon: Activity }
    ]
  }
];

const mobileItems = sections.flatMap((section) => section.items);

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1");
    } catch {
      setCollapsed(false);
    }
  }, []);

  function updateCollapsed(next: boolean) {
    setCollapsed(next);
    try {
      window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? "1" : "0");
    } catch {
      // Local storage is optional; the current session can still collapse.
    }
  }

  const ToggleIcon = collapsed ? PanelLeftOpen : PanelLeftClose;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-white/15 bg-black/70 backdrop-blur-xl">
        <div className="flex h-16 w-full items-center justify-between gap-3 px-4 lg:px-6">
          <Link href="/dashboard" className="inline-flex items-center gap-3" aria-label="Tena Forge">
            <span className="forge-brand-mark grid h-9 w-9 place-items-center rounded-[8px] text-xs font-black text-white">
              T
            </span>
            <span className="hidden text-sm font-black text-white sm:inline">
              TENA FORGE
            </span>
            <span className="hidden border-l border-white/15 pl-3 text-xs font-semibold tracking-normal text-neutral-400 lg:inline">
              가장 강력한 학습 콘텐츠 관리 플랫폼
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <Link href="/billing" className="rounded-[7px] border border-white/20 bg-white/[0.075] px-2.5 py-1 text-[11px] font-semibold text-white transition hover:border-white/30 hover:bg-white/[0.11]">
              Pro trial
            </Link>
            <Link href="/settings/account" className="flex h-9 items-center gap-2 rounded-[8px] border border-white/15 bg-white/[0.050] px-2.5 text-xs font-medium text-neutral-300 transition hover:border-white/25 hover:bg-white/[0.09] hover:text-white">
              <span className="flex h-6 w-6 items-center justify-center rounded-[6px] border border-white/15 bg-white/[0.09] text-[10px] font-bold text-white">T</span>
              <span className="hidden sm:inline">Account</span>
            </Link>
          </div>
        </div>
        <div className="border-t border-white/15 bg-black/65 lg:hidden">
          <nav className="grid w-full grid-cols-6 gap-1 px-4 py-2" aria-label="mobile navigation">
            {mobileItems.map((item, index) => (
              <SidebarItem key={`${item.href}-${index}`} href={item.href} label={item.label} icon={item.icon} active={isActive(pathname, item.href)} mobile />
            ))}
          </nav>
        </div>
      </header>

      <nav
        className={clsx(
          "scrollbar-thin-dark fixed bottom-0 left-0 top-[65px] z-10 hidden flex-col overflow-y-auto border-r border-white/15 bg-black/60 py-4 shadow-[8px_0_32px_rgba(0,0,0,0.28)] backdrop-blur-xl transition-[width,padding] duration-200 lg:flex",
          collapsed ? "w-20 px-2" : "w-64 px-3"
        )}
        aria-label="primary navigation"
      >
        <div className={clsx("mb-3 flex items-center", collapsed ? "justify-center" : "justify-between px-2")}>
          {!collapsed && <div className="text-[11px] font-semibold uppercase text-neutral-500">Tena Forge</div>}
          <button
            type="button"
            className="inline-flex h-9 w-9 items-center justify-center rounded-[8px] border border-white/15 bg-white/[0.045] text-neutral-400 transition hover:border-white/25 hover:bg-white/[0.09] hover:text-white"
            aria-label={collapsed ? "사이드바 펼치기" : "사이드바 접기"}
            title={collapsed ? "사이드바 펼치기" : "사이드바 접기"}
            onClick={() => updateCollapsed(!collapsed)}
          >
            <ToggleIcon className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3">
          {sections.map((section) => (
            <section key={section.title} className={clsx("overflow-hidden rounded-[10px] border shadow-[0_12px_30px_rgba(0,0,0,0.18)]", section.panel)}>
              <div className={clsx("flex items-center border-b border-white/10", collapsed ? "justify-center px-1 py-2" : "gap-2 px-3 py-2.5")}>
                <span className={clsx("rounded-full", section.accent, collapsed ? "h-1.5 w-8" : "h-8 w-1")} />
                {!collapsed && (
                  <div className="min-w-0">
                    <h2 className={clsx("text-[12px] font-bold", section.header)}>{section.title}</h2>
                  </div>
                )}
              </div>
              <div className="space-y-0.5 p-1.5">
                {section.items.map((item, index) => (
                  <SidebarItem
                    key={`${item.href}-${index}`}
                    href={item.href}
                    label={item.label}
                    icon={item.icon}
                    active={isActive(pathname, item.href)}
                    collapsed={collapsed}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      </nav>

      <main className={clsx("w-full px-4 py-6 transition-[padding] duration-200 lg:pr-8", collapsed ? "lg:pl-28" : "lg:pl-72")}>
        <div className="mx-auto w-full max-w-[1440px]">{children}</div>
      </main>
    </div>
  );
}

function SidebarItem({
  href,
  label,
  icon: Icon,
  active,
  mobile = false,
  collapsed = false
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active: boolean;
  mobile?: boolean;
  collapsed?: boolean;
}) {
  return (
    <Link
      href={href}
      title={mobile || collapsed ? label : undefined}
      aria-label={mobile || collapsed ? label : undefined}
      aria-current={active ? "page" : undefined}
      className={clsx(
        "group relative inline-flex items-center border text-sm font-medium transition-all duration-150",
        mobile
          ? "h-10 w-full justify-center rounded-[7px] border-white/15 bg-white/[0.045] px-0 text-neutral-300 hover:border-white/20 hover:bg-white/[0.09] hover:text-white"
          : collapsed
            ? "mx-auto flex h-10 w-10 justify-center rounded-[8px] border-transparent px-0 text-neutral-400 hover:border-white/15 hover:bg-white/[0.065] hover:text-white"
            : "flex h-10 w-full gap-2.5 rounded-[7px] border-transparent px-3 text-neutral-400 hover:border-white/15 hover:bg-white/[0.065] hover:text-white hover:shadow-sm",
        active &&
          (mobile
            ? "border-white/30 bg-white/[0.14] text-white hover:bg-white/[0.14] hover:text-white"
            : "border-white/10 bg-white/[0.08] text-white shadow-[0_10px_28px_rgba(0,0,0,0.18)]")
      )}
    >
      {!mobile && !collapsed && <span className={clsx("absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-transparent transition-colors", active && "bg-white")} />}
      <Icon className={clsx("h-4 w-4 shrink-0 text-neutral-500 transition-colors group-hover:text-neutral-200", active && "text-white group-hover:text-white")} />
      {mobile ? <span className="sr-only">{label}</span> : !collapsed && <span className="truncate">{label}</span>}
    </Link>
  );
}
