"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  CalendarDays,
  FileUp,
  FolderKanban,
  GraduationCap,
  KeyRound,
  LayoutDashboard,
  LayoutTemplate,
  MessageSquare,
  NotebookPen,
  ReceiptText,
  Settings,
  Store,
} from "lucide-react";

import { HeaderAccountSummary } from "@/components/auth/header-account-summary";
import { SidebarNavItem } from "@/components/sidebar-nav-item";
import { getDashboardAnnouncementAccess } from "@/lib/api";
import { AUTH_CHANGED_EVENT, WORKSPACE_CHANGED_EVENT, getActiveWorkspaceId, readStoredAuthProfile } from "@/lib/auth-client";
import type { CoAgentWorkflow } from "@/lib/coAgent";
import {
  areCoAgentWorkflowsEqual,
  CO_AGENT_WORKFLOW_EVENT,
  CO_AGENT_WORKFLOW_STORAGE_KEY,
  readStoredCoAgentWorkflow,
} from "@/lib/coAgentWorkflow";
import { cn } from "@/lib/utils";

type AccountType = "academy" | "student";
type StoredProfile = { account_type?: AccountType; plan?: string | null; roles?: string[] | null };

const sections = [
  {
    title: "Studio",
    shortTitle: "ST",
    description: "내 자료 제작",
    accent: "bg-black",
    panel: "bg-transparent",
    header: "text-zinc-950",
    activeItem: "console-nav-active bg-black text-white hover:bg-black hover:text-white shadow-none",
    activeIndicator: "bg-black",
    activeIcon: "text-white group-hover:text-white",
    items: [
      { href: "/academy", label: "제작 콘솔", icon: LayoutDashboard },
      { href: "/archive/new", label: "추출", icon: FileUp },
      { href: "/problems", label: "보관", icon: Archive, coAgentAnchor: "archive" },
      { href: "/templates/mine", label: "템플릿", icon: LayoutTemplate, coAgentAnchor: "template" },
      { href: "/problem-sets", label: "문항 세트", icon: FolderKanban, coAgentAnchor: "problem_set" },
    ],
  },
  {
    title: "Academy",
    shortTitle: "AC",
    description: "Seats, classes, calendar",
    accountTypes: ["academy"],
    accent: "bg-zinc-950",
    panel: "bg-transparent",
    header: "text-zinc-950",
    activeItem: "console-nav-active bg-black text-white hover:bg-black hover:text-white shadow-none",
    activeIndicator: "bg-black",
    activeIcon: "text-white group-hover:text-white",
    items: [
      { href: "/academy?panel=operations", label: "캘린더", icon: CalendarDays },
      { href: "/student-management", label: "학생 관리", icon: NotebookPen },
      { href: "/student-management?tab=counseling", label: "상담", icon: MessageSquare },
      { href: "/student-management/tuition", label: "수강료", icon: ReceiptText },
    ],
  },
  {
    title: "Hub",
    shortTitle: "HB",
    description: "Templates and sets",
    adminOnly: true,
    accent: "bg-zinc-700",
    panel: "bg-transparent",
    header: "text-zinc-950",
    activeItem: "console-nav-active bg-black text-white hover:bg-black hover:text-white shadow-none",
    activeIndicator: "bg-black",
    activeIcon: "text-white group-hover:text-white",
    items: [
      { href: "/templates", label: "템플릿", icon: LayoutTemplate },
      { href: "/marketplace/problem-sets", label: "세트", icon: Store },
    ],
  },
  {
    title: "Student App",
    shortTitle: "ST",
    description: "Student learning access",
    accountTypes: ["student"],
    accent: "bg-zinc-950",
    panel: "bg-transparent",
    header: "text-zinc-950",
    activeItem: "console-nav-active bg-black text-white hover:bg-black hover:text-white shadow-none",
    activeIndicator: "bg-black",
    activeIcon: "text-white group-hover:text-white",
    items: [
      { href: "/student", label: "학생 홈", icon: GraduationCap },
      { href: "/student", label: "학원 키 등록", icon: KeyRound },
      { href: "/student", label: "오답노트", icon: NotebookPen },
      { href: "/student", label: "학생 캘린더", icon: CalendarDays },
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
  if (hrefPath === "/student-management") return !searchParams?.get("tab");
  return pathname === hrefPath;
}

function coAgentAnchorFor(item: object) {
  const candidate = item as { coAgentAnchor?: unknown };
  return typeof candidate.coAgentAnchor === "string" ? candidate.coAgentAnchor : undefined;
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
  const [coAgentWorkflow, setCoAgentWorkflow] = useState<CoAgentWorkflow | null>(() => readStoredCoAgentWorkflow());
  const isCollapsed = collapsed && !(hoverExpand && autoExpanded);
  const coAgentActiveAnchor =
    coAgentWorkflow &&
    coAgentWorkflow.kind !== "generic" &&
    coAgentWorkflow.active_step !== "command" &&
    coAgentWorkflow.status !== "idle" &&
    coAgentWorkflow.status !== "error"
      ? coAgentWorkflow.active_step
      : null;

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
      const activeWorkspaceId = getActiveWorkspaceId();
      if (activeWorkspaceId) {
        setAccountType(activeWorkspaceId === "student" ? "student" : "academy");
        return;
      }
      const stored = readStoredAuthProfile<StoredProfile>();
      setAccountType(stored?.account_type === "student" ? "student" : "academy");
    }
    syncAccountType();
    window.addEventListener(AUTH_CHANGED_EVENT, syncAccountType);
    window.addEventListener(WORKSPACE_CHANGED_EVENT, syncAccountType);
    window.addEventListener("focus", syncAccountType);
    return () => {
      window.removeEventListener(AUTH_CHANGED_EVENT, syncAccountType);
      window.removeEventListener(WORKSPACE_CHANGED_EVENT, syncAccountType);
      window.removeEventListener("focus", syncAccountType);
    };
  }, []);

  useEffect(() => {
    function syncCoAgentWorkflow() {
      const storedWorkflow = readStoredCoAgentWorkflow();
      setCoAgentWorkflow((current) => (areCoAgentWorkflowsEqual(current, storedWorkflow) ? current : storedWorkflow));
    }

    function handleStorage(event: StorageEvent) {
      if (event.key === CO_AGENT_WORKFLOW_STORAGE_KEY) syncCoAgentWorkflow();
    }

    syncCoAgentWorkflow();
    window.addEventListener(CO_AGENT_WORKFLOW_EVENT, syncCoAgentWorkflow);
    window.addEventListener("storage", handleStorage);
    window.addEventListener("focus", syncCoAgentWorkflow);
    return () => {
      window.removeEventListener(CO_AGENT_WORKFLOW_EVENT, syncCoAgentWorkflow);
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("focus", syncCoAgentWorkflow);
    };
  }, []);

  if (mobile) {
    return (
      <nav
        className="relative z-50 flex touch-pan-x gap-1.5 overflow-x-auto bg-[#fbfbfa]/95 px-4 py-2 pr-8 [scrollbar-width:none] after:w-4 after:shrink-0 after:content-[''] [&::-webkit-scrollbar]:hidden lg:hidden"
        data-coagent-sidebar-nav="mobile"
        aria-label="주요 메뉴"
      >
        {mobileItems.map((item, index) => {
          const active = isActive(pathname, item.href, searchParams);
          const coAgentAnchor = coAgentAnchorFor(item);
          return <SidebarNavItem key={`${item.href}-${index}`} href={item.href} label={item.label} icon={item.icon} active={active} activeClassName={item.activeItem} activeIndicatorClassName={item.activeIndicator} activeIconClassName={item.activeIcon} coAgentAnchor={coAgentAnchor} coAgentActive={coAgentActiveAnchor === coAgentAnchor} mobile />;
        })}
      </nav>
    );
  }

  return (
    <nav
      ref={navRef}
      className={cn(
        "fixed bottom-0 left-0 top-[65px] z-[2000] hidden flex-col overflow-y-auto bg-transparent py-4 shadow-none transition-[width,padding] duration-200 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:flex",
        isCollapsed ? "w-16 px-1.5" : "w-40 px-1.5"
      )}
      data-coagent-sidebar-nav="desktop"
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
          <section key={section.title} className={cn("overflow-hidden rounded-[12px]", section.panel)}>
            <div className={cn("flex items-center", isCollapsed ? "justify-center px-1 py-2" : "gap-1.5 px-2 py-2.5")}>
              <span className={cn("rounded-full", section.accent, isCollapsed ? "h-1.5 w-8" : "h-8 w-1")} />
              {!isCollapsed && (
                <div className="min-w-0">
                  <h2 className={cn("text-[12px] font-bold tracking-[0.02em]", section.header)}>{section.title}</h2>
                </div>
              )}
              {isCollapsed && <span className="sr-only">{section.title}</span>}
            </div>
            <div className="space-y-0.5 p-0.5">
              {section.items.map((item, index) => {
                const active = isActive(pathname, item.href, searchParams);
                const coAgentAnchor = coAgentAnchorFor(item);
                return <SidebarNavItem key={`${item.href}-${index}`} href={item.href} label={item.label} icon={item.icon} active={active} activeClassName={section.activeItem} activeIndicatorClassName={section.activeIndicator} activeIconClassName={section.activeIcon} coAgentAnchor={coAgentAnchor} coAgentActive={coAgentActiveAnchor === coAgentAnchor} collapsed={isCollapsed} />;
              })}
            </div>
          </section>
        ))}
      </div>
      <div className={cn("mt-auto space-y-1 pt-4", isCollapsed ? "px-0" : "px-0.5")}>
        <Link
          href="/account/security"
          title={isCollapsed ? "설정" : undefined}
          aria-label={isCollapsed ? "설정" : undefined}
          aria-current={pathname === "/account/security" || pathname === "/settings" ? "page" : undefined}
          className={cn(
            "group relative inline-flex items-center border border-transparent bg-transparent text-zinc-950 shadow-none transition-all duration-150 hover:border-transparent hover:bg-transparent hover:text-zinc-950",
            isCollapsed
              ? "mx-auto flex h-10 w-10 justify-center rounded-[8px] px-0"
              : "flex h-10 w-full gap-2 rounded-[7px] px-2 text-sm font-medium"
          )}
        >
          {!isCollapsed && <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-black" />}
          <span className="relative z-[1] grid h-5 w-5 shrink-0 place-items-center">
            <Settings className="h-4 w-4 shrink-0 text-zinc-950 transition-colors group-hover:text-zinc-950" />
          </span>
          {!isCollapsed && <span className="truncate">설정</span>}
        </Link>
        <HeaderAccountSummary variant="sidebar" collapsed={isCollapsed} />
      </div>
    </nav>
  );
}
