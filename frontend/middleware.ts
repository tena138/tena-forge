import { NextResponse, type NextRequest } from "next/server";

const publicRoutes = [
  "/",
  "/plan",
  "/checkout",
  "/pricing",
  "/api/billing/checkout",
  "/api/billing/verify",
  "/api/billing/webhook",
  "/api/enterprise-inquiry",
  "/login",
  "/register",
  "/verify-email",
  "/forgot-password",
  "/reset-password",
  "/terms",
  "/privacy",
  "/copyright-policy",
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isPublic = publicRoutes.some((route) => pathname === route || pathname.startsWith(`${route}/`));
  const isAsset = pathname.startsWith("/_next") || pathname.startsWith("/api/auth") || pathname.includes(".");

  if (isPublic || isAsset) return NextResponse.next();

  const loggedIn = request.cookies.get("tf_logged_in")?.value === "1";
  if (!loggedIn) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
