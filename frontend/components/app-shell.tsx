"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { HeaderAccountSummary } from "@/components/auth/header-account-summary";
import { FloatingNav } from "@/components/floating-nav";
import { HeaderNotifications } from "@/components/header-notifications";
import { SiteLogo } from "@/components/site-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { fetchMe } from "@/lib/auth-api";
import { AUTH_CHANGED_EVENT, clearAuthState, ensureAccessToken, readStoredAuthProfile, setAccessToken } from "@/lib/auth-client";
import { resolvePostLoginRedirect } from "@/lib/auth-redirect";

const authRoutes = ["/login", "/register", "/verify-email", "/forgot-password", "/reset-password"];
const marketingRoutes = ["/", "/plan", "/checkout", "/pricing", "/terms", "/privacy", "/copyright-policy"];

function isAuthFailure(error: unknown) {
  const status = (error as { response?: { status?: number } })?.response?.status;
  return status === 401 || status === 403;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [homeHref, setHomeHref] = useState("/academy");
  const [sessionReady, setSessionReady] = useState(false);
  const isAuthRoute = authRoutes.some((route) => pathname === route || pathname.startsWith(`${route}/`));
  const isMarketingRoute = marketingRoutes.some((route) => pathname === route || pathname.startsWith(`${route}/`));

  useEffect(() => {
    function syncHomeHref() {
      const profile = readStoredAuthProfile<{ account_type?: "academy" | "student" }>();
      setHomeHref(profile?.account_type === "student" ? "/student" : "/academy");
    }
    syncHomeHref();
    window.addEventListener(AUTH_CHANGED_EVENT, syncHomeHref);
    window.addEventListener("focus", syncHomeHref);
    return () => {
      window.removeEventListener(AUTH_CHANGED_EVENT, syncHomeHref);
      window.removeEventListener("focus", syncHomeHref);
    };
  }, []);

  useEffect(() => {
    if (isAuthRoute || isMarketingRoute) {
      setSessionReady(true);
      return;
    }
    let active = true;
    setSessionReady(false);
    ensureAccessToken()
      .then(async (token) => {
        if (!active) return;
        if (!token) {
          clearAuthState();
          const loginUrl = `/login?redirect=${encodeURIComponent(pathname)}`;
          router.replace(loginUrl);
          return;
        }
        try {
          await fetchMe();
        } catch (error) {
          if (!active) return;
          if (isAuthFailure(error)) {
            clearAuthState();
            router.replace(`/login?redirect=${encodeURIComponent(pathname)}`);
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
        router.replace(`/login?redirect=${encodeURIComponent(pathname)}`);
      });
    return () => {
      active = false;
    };
  }, [isAuthRoute, isMarketingRoute, pathname, router]);

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

  if (!sessionReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-sm text-slate-400" data-app-shell>
        세션을 복구하는 중입니다...
      </div>
    );
  }

  return (
    <div className="min-h-screen" data-app-shell>
      <OAuthFragmentCapture />
      <header className="sticky top-0 z-20 border-b border-white/10 bg-black/55 backdrop-blur-xl">
        <div className="flex h-16 w-full items-center justify-between gap-3 px-4 lg:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <Link href={homeHref} className="inline-flex shrink-0 items-center" aria-label="Tena Forge">
              <SiteLogo />
            </Link>
            <span className="hidden min-w-0 border-l border-white/10 pl-3 text-xs font-semibold tracking-normal text-slate-400 sm:inline">
              가장 강력한 교육 콘텐츠 인프라
            </span>
          </div>
          <div className="flex min-w-0 items-center gap-2">
            <ThemeToggle />
            <HeaderNotifications />
            <HeaderAccountSummary />
          </div>
        </div>
        <Suspense fallback={null}>
          <FloatingNav mobile />
        </Suspense>
      </header>

      <Suspense fallback={null}>
        <FloatingNav collapsed hoverExpand />
      </Suspense>

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

    fetchMe()
      .then((profile) => {
        if (!active) return;
        const destination = resolvePostLoginRedirect(pathname, profile.account_type);
        if (destination === pathname) router.refresh();
        else router.replace(destination);
      })
      .catch(() => {
        if (!active) return;
        const destination = resolvePostLoginRedirect(pathname);
        if (destination === pathname) router.refresh();
        else router.replace(destination);
      });

    return () => {
      active = false;
    };
  }, [pathname, router]);
  return null;
}
