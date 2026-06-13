"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  BookOpen,
  BookOpenCheck,
  CalendarDays,
  ClipboardCheck,
  FileUp,
  FolderKanban,
  GraduationCap,
  LayoutDashboard,
  LayoutTemplate,
  Library,
  Megaphone,
  NotebookPen,
  ShieldCheck,
  Store,
  UserCircle,
  type LucideIcon,
} from "lucide-react";

import { SidebarNavItem } from "@/components/sidebar-nav-item";
import { getDashboardAnnouncementAccess } from "@/lib/api";
import { AUTH_CHANGED_EVENT, readStoredAuthProfile } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

type AccountType = "academy" | "student";
type StoredProfile = { account_type?: AccountType; plan?: string | null; roles?: string[] | null };
type NavItem = { href: string; label: string; icon: LucideIcon; adminOnly?: boolean };
type NavSection = {
  title: string;
  shortTitle: string;
  description: string;
  accountTypes?: AccountType[];
  adminOnly?: boolean;
  accent: string;
  panel: string;
  header: string;
  activeItem: string;
  activeIndicator: string;
  activeIcon: string;
  items: NavItem[];
};

const sections: NavSection[] = [
  {
    title: "제작",
    shortTitle: "제작",
    description: "자료 제작",
    accountTypes: ["academy"],
    accent: "bg-violet-400",
    panel: "border-violet-400/20 bg-violet-400/[0.055]",
    header: "text-violet-100",
    activeItem: "border-violet-400/25 bg-violet-400/10 text-violet-50 hover:bg-violet-400/10 hover:text-violet-50 shadow-[0_10px_28px_rgba(0,0,0,0.18)]",
    activeIndicator: "bg-violet-400",
    activeIcon: "text-violet-300 group-hover:text-violet-300",
    items: [
      { href: "/academy", label: "홈", icon: LayoutDashboard },
      { href: "/archive/new", label: "자료 업로드", icon: FileUp },
      { href: "/problems/review", label: "문항 검토", icon: ClipboardCheck },
      { href: "/problems", label: "문항 보관함", icon: Archive },
      { href: "/problem-sets", label: "문항 세트", icon: FolderKanban },
      { href: "/templates/mine", label: "템플릿", icon: LayoutTemplate },
    ],
  },
  {
    title: "운영",
    shortTitle: "운영",
    description: "수업 운영",
    accountTypes: ["academy"],
    accent: "bg-sky-300",
    panel: "border-sky-300/20 bg-sky-300/[0.045]",
    header: "text-sky-100",
    activeItem: "border-sky-300/25 bg-sky-300/10 text-sky-50 hover:bg-sky-300/10 hover:text-sky-50 shadow-[0_10px_28px_rgba(0,0,0,0.18)]",
    activeIndicator: "bg-sky-300",
    activeIcon: "text-sky-200 group-hover:text-sky-200",
    items: [
      { href: "/academy?panel=operations", label: "일정", icon: CalendarDays },
      { href: "/academy?panel=assignments", label: "과제", icon: BookOpenCheck },
      { href: "/student-management", label: "학생 관리", icon: NotebookPen },
      { href: "/licensed-library", label: "라이선스 보관", icon: Library },
    ],
  },
  {
    title: "관리자",
    shortTitle: "관리",
    description: "내부 관리",
    adminOnly: true,
    accent: "bg-emerald-300",
    panel: "border-emerald-300/20 bg-emerald-300/[0.045]",
    header: "text-emerald-100",
    activeItem: "border-emerald-300/25 bg-emerald-300/10 text-emerald-50 hover:bg-emerald-300/10 hover:text-emerald-50 shadow-[0_10px_28px_rgba(0,0,0,0.18)]",
    activeIndicator: "bg-emerald-300",
    activeIcon: "text-emerald-200 group-hover:text-emerald-200",
    items: [
      { href: "/templates", label: "템플릿 허브", icon: LayoutTemplate },
      { href: "/marketplace/problem-sets", label: "문항 세트 마켓", icon: Store },
      { href: "/marketplace/books", label: "교재 마켓", icon: BookOpen },
    ],
  },
  {
    title: "학생",
    shortTitle: "학생",
    description: "학생 앱",
    accountTypes: ["student"],
    accent: "bg-sky-300",
    panel: "border-sky-300/20 bg-sky-300/[0.045]",
    header: "text-sky-100",
    activeItem: "border-sky-300/25 bg-sky-300/10 text-sky-50 hover:bg-sky-300/10 hover:text-sky-50 shadow-[0_10px_28px_rgba(0,0,0,0.18)]",
    activeIndicator: "bg-sky-300",
    activeIcon: "text-sky-200 group-hover:text-sky-200",
    items: [{ href: "/student", label: "학생 홈", icon: GraduationCap }],
  },
  {
    title: "계정",
    shortTitle: "계정",
    description: "계정 관리",
    accent: "bg-slate-300",
    panel: "border-white/12 bg-white/[0.035]",
    header: "text-slate-200",
    activeItem: "border-slate-300/20 bg-white/[0.08] text-white hover:bg-white/[0.08] hover:text-white shadow-[0_10px_28px_rgba(0,0,0,0.18)]",
    activeIndicator: "bg-slate-300",
    activeIcon: "text-slate-200 group-hover:text-slate-200",
    items: [
      { href: "/account/profile", label: "프로필", icon: UserCircle },
      { href: "/account/rights-policy", label: "권리 정책", icon: ShieldCheck },
      { href: "/admin/announcements", label: "공지 관리", icon: Megaphone, adminOnly: true },
    ],
  },
];

function isActive(pathname: string, href: string, searchParams?: URLSearchParams) {
  const [hrefPath, hrefQuery] = href.split("?");
  if (href === "/") return pathname === "/";
  if (hrefQuery) {
    const expected = new URLSearchParams(hrefQuery);
    return pathname === hrefPath && Array.from(expected.entries()).every(([key, value]) => searchParams?.get(key) === value);
  }
  if (pathname !== hrefPath) return false;
  if (hrefPath === "/academy") return !searchParams?.get("panel") && !searchParams?.get("tab");
  return pathname === hrefPath;
}

export function FloatingNav({
  mobile = false,
  collapsed = false,
  hoverExpand = false,
}: {
  mobile?: boolean;
  collapsed?: boolean;
  hoverExpand?: boolean;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const navRef = useRef<HTMLElement | null>(null);
  const [canManageAnnouncements, setCanManageAnnouncements] = useState(false);
  const [accountType, setAccountType] = useState<AccountType>("academy");
  const [autoExpanded, setAutoExpanded] = useState(false);
  const isCollapsed = collapsed && !(hoverExpand && autoExpanded);

  const visibleSections = useMemo(
    () =>
      sections
        .filter((section) => !section.accountTypes || section.accountTypes.includes(accountType))
        .filter((section) => !section.adminOnly || canManageAnnouncements)
        .map((section) => ({
          ...section,
          items: section.items.filter((item) => !item.adminOnly || canManageAnnouncements),
        }))
        .filter((section) => section.items.length > 0),
    [accountType, canManageAnnouncements]
  );
  const mobileItems = visibleSections.flatMap((section) =>
    section.items.map((item) => ({
      ...item,
      activeItem: section.activeItem,
      activeIndicator: section.activeIndicator,
      activeIcon: section.activeIcon,
    }))
  );

  useEffect(() => {
    getDashboardAnnouncementAccess()
      .then((access) => setCanManageAnnouncements(access.can_manage))
      .catch(() => setCanManageAnnouncements(false));
  }, []);

  useEffect(() => {
    function syncAccountType() {
      const stored = readStoredAuthProfile<StoredProfile>();
      setAccountType(stored?.account_type === "student" ? "student" : "academy");
    }
    syncAccountType();
    window.addEventListener(AUTH_CHANGED_EVENT, syncAccountType);
    window.addEventListener("focus", syncAccountType);
    return () => {
      window.removeEventListener(AUTH_CHANGED_EVENT, syncAccountType);
      window.removeEventListener("focus", syncAccountType);
    };
  }, []);

  if (mobile) {
    return (
      <nav className="flex gap-1 overflow-x-auto border-t border-white/10 bg-black/50 px-4 py-2 lg:hidden" aria-label="주요 메뉴">
        {mobileItems.map((item, index) => {
          const active = isActive(pathname, item.href, searchParams);
          return <SidebarNavItem key={`${item.href}-${index}`} href={item.href} label={item.label} icon={item.icon} active={active} activeClassName={item.activeItem} activeIndicatorClassName={item.activeIndicator} activeIconClassName={item.activeIcon} mobile />;
        })}
      </nav>
    );
  }

  return (
    <nav
      ref={navRef}
      className={cn(
        "scrollbar-thin-dark fixed bottom-0 left-0 top-[65px] z-[2000] hidden flex-col overflow-y-auto border-r border-white/10 bg-black/45 py-4 shadow-[8px_0_32px_rgba(0,0,0,0.22)] backdrop-blur-xl transition-[width,padding] duration-200 lg:flex",
        isCollapsed ? "w-16 px-1.5" : "w-56 px-3"
      )}
      onMouseEnter={() => hoverExpand && setAutoExpanded(true)}
      onMouseLeave={() => hoverExpand && setAutoExpanded(false)}
      onFocusCapture={() => hoverExpand && setAutoExpanded(true)}
      onBlurCapture={(event) => {
        if (!hoverExpand) return;
        const next = event.relatedTarget;
        if (!(next instanceof Node) || !navRef.current?.contains(next)) {
          setAutoExpanded(false);
        }
      }}
      aria-label="주요 메뉴"
    >
      <div className="space-y-3">
        {visibleSections.map((section) => (
          <section key={section.title} className={cn("overflow-hidden rounded-[12px] border shadow-[0_12px_30px_rgba(0,0,0,0.14)]", section.panel)}>
            <div className={cn("flex items-center border-b border-white/10", isCollapsed ? "justify-center px-1 py-2" : "gap-2 px-2.5 py-2.5")}>
              <span className={cn("rounded-full", section.accent, isCollapsed ? "h-1.5 w-8" : "h-8 w-1")} />
              {!isCollapsed && (
                <div className="min-w-0">
                  <h2 className={cn("text-[12px] font-bold tracking-[0.02em]", section.header)}>{section.title}</h2>
                </div>
              )}
              {isCollapsed && <span className="sr-only">{section.title}</span>}
            </div>
            <div className="space-y-0.5 p-1">
              {section.items.map((item, index) => {
                const active = isActive(pathname, item.href, searchParams);
                return <SidebarNavItem key={`${item.href}-${index}`} href={item.href} label={item.label} icon={item.icon} active={active} activeClassName={section.activeItem} activeIndicatorClassName={section.activeIndicator} activeIconClassName={section.activeIcon} collapsed={isCollapsed} />;
              })}
            </div>
          </section>
        ))}
      </div>
    </nav>
  );
}
