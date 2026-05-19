import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_ROUTES = ["/", "/landing", "/login", "/signup", "/forgot-password", "/terms", "/privacy", "/copyright-policy"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`));
  const isAsset = pathname.startsWith("/_next") || pathname.includes(".");
  const isApi = pathname.startsWith("/api/");

  if (isPublic || isAsset || isApi) return NextResponse.next();

  const hasSupabaseSession = request.cookies.get("sb-access-token") || request.cookies.get("sb-refresh-token");
  if (!hasSupabaseSession) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
