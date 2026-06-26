"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { HeaderAccountSummary } from "@/components/auth/header-account-summary";
import { CoAgentJellyOverlay } from "@/components/co-agent/co-agent-jelly-overlay";
import { CoAgentStatusBar } from "@/components/co-agent/co-agent-status-bar";
import { FloatingNav } from "@/components/floating-nav";
import { SiteLogo } from "@/components/site-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { fetchMe } from "@/lib/auth-api";
import { AUTH_CHANGED_EVENT, WORKSPACE_CHANGED_EVENT, clearAuthState, ensureAccessToken, getAccessToken, getActiveWorkspaceId, readStoredAuthProfile, setAccessToken } from "@/lib/auth-client";
import { resolvePostLoginRedirect } from "@/lib/auth-redirect";

const authRoutes = ["/login", "/register", "/verify-email", "/forgot-password", "/reset-password"];
const marketingRoutes = ["/", "/plan", "/checkout", "/pricing", "/terms", "/privacy", "/refund-policy", "/copyright-policy"];
const billingAllowedRoutes = ["/billing", "/plan", "/checkout", "/account/profile", "/account/security"];
const marketplaceAdminRoutes = ["/marketplace", "/stores", "/creator", "/purchases"];
const SESSION_READY_FALLBACK_MS = 1500;

function isAdminProfile(profile: { plan?: string | null; roles?: string[] | null }) {
  const roles = profile.roles || [];
  return String(profile.plan || "").toLowerCase() === "admin" || roles.includes("admin") || roles.includes("super_admin");
}

function isMarketplaceAdminRoute(pathname: string) {
  return marketplaceAdminRoutes.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

function isAuthFailure(error: unknown) {
  const status = (error as { response?: { status?: number } })?.response?.status;
  return status === 401 || status === 403;
}

function currentPathWithSearch() {
  if (typeof window === "undefined") return "/";
  return `${window.location.pathname}${window.location.search}`;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [homeHref, setHomeHref] = useState("/academy");
  const [sessionReady, setSessionReady] = useState(false);
  const [isLiveLectureShareRoute, setIsLiveLectureShareRoute] = useState(() => (
    typeof window !== "undefined" &&
    window.location.pathname === "/live-lecture" &&
    new URLSearchParams(window.location.search).get("share") === "1"
  ));
  const isAuthRoute = authRoutes.some((route) => pathname === route || pathname.startsWith(`${route}/`));
  const isMarketingRoute = marketingRoutes.some((route) => pathname === route || pathname.startsWith(`${route}/`));

  useEffect(() => {
    function syncLiveLectureShareRoute() {
      setIsLiveLectureShareRoute(
        window.location.pathname === "/live-lecture" &&
        new URLSearchParams(window.location.search).get("share") === "1"
      );
    }
    syncLiveLectureShareRoute();
    window.addEventListener("popstate", syncLiveLectureShareRoute);
    return () => window.removeEventListener("popstate", syncLiveLectureShareRoute);
  }, [pathname]);

  useEffect(() => {
    function syncHomeHref() {
      const activeWorkspaceId = getActiveWorkspaceId();
      if (activeWorkspaceId) {
        setHomeHref(activeWorkspaceId === "student" ? "/student" : "/academy");
        return;
      }
      const profile = readStoredAuthProfile<{ account_type?: "academy" | "student" }>();
      setHomeHref(profile?.account_type === "student" ? "/student" : "/academy");
    }
    syncHomeHref();
    window.addEventListener(AUTH_CHANGED_EVENT, syncHomeHref);
    window.addEventListener(WORKSPACE_CHANGED_EVENT, syncHomeHref);
    window.addEventListener("focus", syncHomeHref);
    return () => {
      window.removeEventListener(AUTH_CHANGED_EVENT, syncHomeHref);
      window.removeEventListener(WORKSPACE_CHANGED_EVENT, syncHomeHref);
      window.removeEventListener("focus", syncHomeHref);
    };
  }, []);

  useEffect(() => {
    if (isLiveLectureShareRoute || isAuthRoute || isMarketingRoute) {
      setSessionReady(true);
      return;
    }
    let active = true;
    setSessionReady(false);
    const hasCachedSession = Boolean(getAccessToken() || readStoredAuthProfile());
    const readyFallback = hasCachedSession
      ? window.setTimeout(() => {
          if (active) setSessionReady(true);
        }, SESSION_READY_FALLBACK_MS)
      : null;
    ensureAccessToken()
      .then(async (token) => {
        if (!active) return;
        if (!token) {
          clearAuthState();
          const loginUrl = `/login?redirect=${encodeURIComponent(currentPathWithSearch())}`;
          router.replace(loginUrl);
          return;
        }
        try {
          const profile = await fetchMe();
          if (isMarketplaceAdminRoute(pathname) && !isAdminProfile(profile)) {
            router.replace(profile.account_type === "student" ? "/student" : "/academy");
            return;
          }
          const canVisitForBilling = billingAllowedRoutes.some((route) => pathname === route || pathname.startsWith(`${route}/`));
          if (profile.account_type !== "student" && profile.requires_payment && !canVisitForBilling) {
            router.replace("/billing?trial=expired");
            return;
          }
          const activeWorkspaceId = getActiveWorkspaceId();
          const staffWorkspaceActive = Boolean(activeWorkspaceId && activeWorkspaceId !== "student" && activeWorkspaceId !== profile.id);
          if (staffWorkspaceActive && (pathname === "/billing" || pathname.startsWith("/billing/"))) {
            router.replace("/academy");
            return;
          }
        } catch (error) {
          if (!active) return;
          if (isAuthFailure(error)) {
            clearAuthState();
            router.replace(`/login?redirect=${encodeURIComponent(currentPathWithSearch())}`);
            return;
          }
          setSessionReady(true);
          return;
        }
        if (!active) return;
        setSessionReady(true);
      })
      .catch((error) => {
        if (!active) return;
        if (!isAuthFailure(error)) {
          setSessionReady(true);
          return;
        }
        clearAuthState();
        router.replace(`/login?redirect=${encodeURIComponent(currentPathWithSearch())}`);
      });
    return () => {
      active = false;
      if (readyFallback !== null) window.clearTimeout(readyFallback);
    };
  }, [isAuthRoute, isLiveLectureShareRoute, isMarketingRoute, pathname, router]);

  if (isAuthRoute || isMarketingRoute) {
    return (
      <div className="min-h-screen bg-background" data-app-shell>
        <OAuthFragmentCapture />
        {isAuthRoute && (
          <div className="fixed right-4 top-4 z-30">
            <ThemeToggle compact />
          </div>
        )}
        {children}
      </div>
    );
  }

  if (isLiveLectureShareRoute) {
    return (
      <div className="min-h-screen bg-black text-white" data-app-shell>
        {children}
      </div>
    );
  }

  if (!sessionReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#fbfbfa] text-sm text-zinc-500" data-app-shell>
        세션을 복구하는 중입니다...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#fbfbfa] text-zinc-950" data-app-shell>
      <OAuthFragmentCapture />
      <header className="app-header-divider sticky top-0 z-30 border-b border-black/10 bg-[#fbfbfa]/90 backdrop-blur-xl">
        <div className="grid min-h-16 w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 px-4 py-2 sm:gap-3 lg:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <Link href={homeHref} className="inline-flex shrink-0 items-center" aria-label="Tena Forge">
              <SiteLogo />
            </Link>
          </div>
          <div className="hidden min-w-0 overflow-visible items-center justify-center px-2 xl:flex xl:px-4">
            <CoAgentStatusBar />
          </div>
          <div className="-mr-1 flex min-w-0 shrink-0 items-center justify-self-end gap-1 sm:mr-0 sm:gap-2">
            <HeaderAccountSummary />
          </div>
        </div>
        <div className="px-4 pb-2 lg:pl-24 lg:pr-8 xl:hidden">
          <CoAgentStatusBar compact />
        </div>
        <Suspense fallback={null}>
          <FloatingNav mobile />
        </Suspense>
      </header>

      <Suspense fallback={null}>
        <FloatingNav collapsed hoverExpand />
      </Suspense>
      <CoAgentJellyOverlay />
      <main className="w-full px-4 py-6 transition-[padding] duration-200 lg:pl-24 lg:pr-8">
        <div className="mx-auto w-full max-w-[1440px]">{children}</div>
      </main>
    </div>
  );
}

function OAuthFragmentCapture() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!window.location.hash.includes("access_token=")) return;
    let active = true;
    const params = new URLSearchParams(window.location.hash.slice(1));
    const token = params.get("access_token");
    if (!token) return;
    setAccessToken(token);
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
    const currentPath = currentPathWithSearch();

    fetchMe()
      .then((profile) => {
        if (!active) return;
        const destination = resolvePostLoginRedirect(params.get("redirect") || currentPath, profile.account_type);
        if (destination === currentPath) router.refresh();
        else router.replace(destination);
      })
      .catch(() => {
        if (!active) return;
        const destination = resolvePostLoginRedirect(params.get("redirect") || currentPath);
        if (destination === currentPath) router.refresh();
        else router.replace(destination);
      });

    return () => {
      active = false;
    };
  }, [pathname, router]);
  return null;
}
