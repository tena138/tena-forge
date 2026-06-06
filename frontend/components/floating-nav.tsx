"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  BookOpenCheck,
  BookOpen,
  CalendarDays,
  ClipboardCheck,
  FileUp,
  FolderKanban,
  GraduationCap,
  KeyRound,
  LayoutDashboard,
  LayoutTemplate,
  Library,
  Megaphone,
  NotebookPen,
  Settings,
  ShieldCheck,
  Store,
  UserCircle,
} from "lucide-react";

import { SidebarNavItem } from "@/components/sidebar-nav-item";
import { getDashboardAnnouncementAccess } from "@/lib/api";
import { AUTH_CHANGED_EVENT, readStoredAuthProfile } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

type AccountType = "academy" | "student";
type StoredProfile = { account_type?: AccountType; plan?: string | null; roles?: string[] | null };

const sections = [
  {
    title: "Private Studio",
    shortTitle: "PS",
    description: "내 자료 제작",
    accent: "bg-violet-400",
    panel: "border-violet-400/20 bg-violet-400/[0.055]",
    header: "text-violet-100",
    activeItem: "border-violet-400/25 bg-violet-400/10 text-violet-50 hover:bg-violet-400/10 hover:text-violet-50 shadow-[0_10px_28px_rgba(0,0,0,0.18)]",
    activeIndicator: "bg-violet-400",
    activeIcon: "text-violet-300 group-hover:text-violet-300",
    items: [
      { href: "/academy", label: "제작 콘솔", icon: LayoutDashboard },
      { href: "/archive/new", label: "추출", icon: FileUp },
      { href: "/problems/review", label: "검토", icon: ClipboardCheck },
      { href: "/problems", label: "보관", icon: Archive },
      { href: "/templates/mine", label: "템플릿", icon: LayoutTemplate },
      { href: "/problem-sets", label: "문항 세트", icon: FolderKanban },
    ],
  },
  {
    title: "Academy OS",
    shortTitle: "AO",
    description: "Seats, classes, assignments",
    accountTypes: ["academy"],
    accent: "bg-sky-300",
    panel: "border-sky-300/20 bg-sky-300/[0.045]",
    header: "text-sky-100",
    activeItem: "border-sky-300/25 bg-sky-300/10 text-sky-50 hover:bg-sky-300/10 hover:text-sky-50 shadow-[0_10px_28px_rgba(0,0,0,0.18)]",
    activeIndicator: "bg-sky-300",
    activeIcon: "text-sky-200 group-hover:text-sky-200",
    items: [
      { href: "/academy?panel=operations", label: "학원 운영", icon: GraduationCap },
      { href: "/academy?panel=assignments", label: "과제", icon: BookOpenCheck },
      { href: "/student-management", label: "학생 관리", icon: NotebookPen },
      { href: "/licensed-library", label: "라이선스 보관함", icon: Library },
    ],
  },
  {
    title: "Marketplace",
    shortTitle: "MP",
    description: "공개 허브",
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
    title: "Student App",
    shortTitle: "ST",
    description: "Student learning access",
    accountTypes: ["student"],
    accent: "bg-sky-300",
    panel: "border-sky-300/20 bg-sky-300/[0.045]",
    header: "text-sky-100",
    activeItem: "border-sky-300/25 bg-sky-300/10 text-sky-50 hover:bg-sky-300/10 hover:text-sky-50 shadow-[0_10px_28px_rgba(0,0,0,0.18)]",
    activeIndicator: "bg-sky-300",
    activeIcon: "text-sky-200 group-hover:text-sky-200",
    items: [
      { href: "/student", label: "학생 홈", icon: GraduationCap },
      { href: "/student", label: "학원 키 등록", icon: KeyRound },
      { href: "/student", label: "오답노트", icon: NotebookPen },
      { href: "/student", label: "학생 캘린더", icon: CalendarDays },
    ],
  },
  {
    title: "Admin",
    shortTitle: "AD",
    description: "계정 및 정책",
    accent: "bg-slate-300",
    panel: "border-white/12 bg-white/[0.035]",
    header: "text-slate-200",
    activeItem: "border-slate-300/20 bg-white/[0.08] text-white hover:bg-white/[0.08] hover:text-white shadow-[0_10px_28px_rgba(0,0,0,0.18)]",
    activeIndicator: "bg-slate-300",
    activeIcon: "text-slate-200 group-hover:text-slate-200",
    items: [
      { href: "/account/profile", label: "프로필", icon: UserCircle },
      { href: "/admin/announcements", label: "소식 관리", icon: Megaphone, adminOnly: true },
      { href: "/account/rights-policy", label: "권리 및 업로드 정책", icon: ShieldCheck },
      { href: "/settings", label: "설정", icon: Settings },
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
        .filter((section) => !("adminOnly" in section) || !section.adminOnly || canManageAnnouncements)
        .map((section) => ({
          ...section,
          items: section.items.filter((item) => !("adminOnly" in item) || !item.adminOnly || canManageAnnouncements),
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
        isCollapsed ? "w-16 px-1.5" : "w-48 px-2"
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
