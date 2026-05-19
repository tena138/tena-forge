export type AccountType = "academy" | "student";

export function workspaceHome(accountType?: AccountType) {
  return accountType === "student" ? "/student" : "/academy";
}

export function isMarketingOrAuthPath(pathname: string) {
  if (pathname === "/" || pathname === "/pricing" || pathname === "/plan" || pathname === "/checkout") return true;
  return [
    "/pricing/",
    "/plan/",
    "/checkout/",
    "/login",
    "/register",
    "/forgot-password",
    "/reset-password",
    "/verify-email",
    "/terms",
    "/privacy",
    "/copyright-policy",
  ].some((prefix) => pathname.startsWith(prefix));
}

export function resolvePostLoginRedirect(rawRedirect: string | null, accountType?: AccountType) {
  const fallback = workspaceHome(accountType);
  if (!rawRedirect || !rawRedirect.startsWith("/") || rawRedirect.startsWith("//")) return fallback;

  const pathname = rawRedirect.split(/[?#]/)[0] || "/";
  if (isMarketingOrAuthPath(pathname)) return fallback;
  return rawRedirect;
}
