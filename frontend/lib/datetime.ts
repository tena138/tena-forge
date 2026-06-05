const KST_TIME_ZONE = "Asia/Seoul";

const ISO_DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
const HAS_EXPLICIT_TIME_ZONE_RE = /(?:Z|[+-]\d{2}:?\d{2})$/i;

export function parseApiDate(value?: string | null) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return null;

  const normalized =
    trimmed.includes("T") && !HAS_EXPLICIT_TIME_ZONE_RE.test(trimmed)
      ? `${trimmed}Z`
      : ISO_DATE_ONLY_RE.test(trimmed)
        ? `${trimmed}T00:00:00+09:00`
        : trimmed;

  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatKstDateTime(
  value?: string | null,
  options: Intl.DateTimeFormatOptions = {},
  fallback = "",
) {
  const date = parseApiDate(value);
  if (!date) return fallback;
  return new Intl.DateTimeFormat("ko-KR", { ...options, timeZone: KST_TIME_ZONE }).format(date);
}
