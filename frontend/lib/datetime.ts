const KST_TIME_ZONE = "Asia/Seoul";

const ISO_DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
const HAS_EXPLICIT_TIME_ZONE_RE = /(?:Z|[+-]\d{2}:?\d{2})$/i;

export function parseApiDate(value?: string | Date | null) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

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
  value?: string | Date | null,
  options: Intl.DateTimeFormatOptions = {},
  fallback = "",
) {
  const date = parseApiDate(value);
  if (!date) return fallback;
  return new Intl.DateTimeFormat("ko-KR", {
    ...options,
    timeZone: KST_TIME_ZONE,
    hour12: false,
    hourCycle: "h23",
  }).format(date);
}

export function formatKstTime(value?: string | Date | null, fallback = "") {
  return formatKstDateTime(value, { hour: "2-digit", minute: "2-digit" }, fallback);
}

export function formatKstMonthDay(value?: string | Date | null, fallback = "") {
  const date = parseApiDate(value);
  if (!date) return fallback;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: KST_TIME_ZONE,
    month: "numeric",
    day: "numeric",
  }).format(date);
}

export function formatKstMonthDayTime(value?: string | Date | null, fallback = "") {
  const date = formatKstMonthDay(value);
  const time = formatKstTime(value);
  return date && time ? `${date} ${time}` : fallback;
}

export function parseLocalDateTime(value?: string | Date | null) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  const trimmed = String(value || "").trim();
  if (!trimmed) return null;
  const date = new Date(trimmed);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatLocalDateTime(
  value?: string | Date | null,
  options: Intl.DateTimeFormatOptions = {},
  fallback = "",
) {
  const date = parseLocalDateTime(value);
  if (!date) return fallback;
  return new Intl.DateTimeFormat("ko-KR", {
    ...options,
    hour12: false,
    hourCycle: "h23",
  }).format(date);
}

export function formatLocalTime(value?: string | Date | null, fallback = "") {
  return formatLocalDateTime(value, { hour: "2-digit", minute: "2-digit" }, fallback);
}
