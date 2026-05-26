export type ScheduleRecurrenceUnit = "none" | "day" | "week" | "month";

export type ScheduleRecurrenceSettings = {
  unit: ScheduleRecurrenceUnit;
  interval: number;
  weekdays?: number[];
  monthDay?: number;
  until?: string;
  maxOccurrences?: number;
};

export const scheduleWeekdays = [
  { value: 0, label: "일" },
  { value: 1, label: "월" },
  { value: 2, label: "화" },
  { value: 3, label: "수" },
  { value: 4, label: "목" },
  { value: 5, label: "금" },
  { value: 6, label: "토" },
];

export const dayIntervalOptions = Array.from({ length: 31 }, (_, index) => index + 1);
export const weekIntervalOptions = Array.from({ length: 12 }, (_, index) => index + 1);
export const monthIntervalOptions = Array.from({ length: 12 }, (_, index) => index + 1);
export const monthDayOptions = Array.from({ length: 31 }, (_, index) => index + 1);

function pad(value: number) {
  return String(value).padStart(2, "0");
}

export function localDateKey(value: Date | string) {
  const date = typeof value === "string" ? new Date(value) : value;
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function localDateTimeInputValue(date: Date) {
  return `${localDateKey(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function dateTimeParts(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return {
    hour: date.getHours(),
    minute: date.getMinutes(),
    second: date.getSeconds(),
  };
}

export function defaultWeekdayFromDateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().getDay() : date.getDay();
}

export function defaultMonthDayFromDateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().getDate() : date.getDate();
}

function clampInteger(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function endOfDate(value: string) {
  const date = new Date(`${value}T23:59:59`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function copyDateWithTime(source: Date, time: { hour: number; minute: number; second: number }) {
  const next = new Date(source);
  next.setHours(time.hour, time.minute, time.second, 0);
  return next;
}

function addDays(source: Date, days: number) {
  const next = new Date(source);
  next.setDate(next.getDate() + days);
  return next;
}

function addMonths(source: Date, months: number) {
  return new Date(source.getFullYear(), source.getMonth() + months, 1);
}

function startOfWeek(source: Date) {
  const next = new Date(source);
  next.setHours(0, 0, 0, 0);
  next.setDate(next.getDate() - next.getDay());
  return next;
}

function monthDate(year: number, month: number, day: number, time: { hour: number; minute: number; second: number }) {
  const lastDay = new Date(year, month + 1, 0).getDate();
  return new Date(year, month, Math.min(day, lastDay), time.hour, time.minute, time.second, 0);
}

export function buildRecurringDateTimes(startDateTime: string, settings: ScheduleRecurrenceSettings) {
  const start = new Date(startDateTime);
  if (Number.isNaN(start.getTime())) return [];
  if (settings.unit === "none") return [startDateTime];

  const limit = settings.until ? endOfDate(settings.until) : null;
  if (!limit || start > limit) return [startDateTime];

  const interval = clampInteger(settings.interval, 1, settings.unit === "day" ? 365 : 60);
  const maxOccurrences = clampInteger(settings.maxOccurrences || 160, 1, 500);
  const time = dateTimeParts(startDateTime) || { hour: start.getHours(), minute: start.getMinutes(), second: 0 };
  const starts: Date[] = [];

  if (settings.unit === "day") {
    let cursor = new Date(start);
    let guard = 0;
    while (cursor <= limit && starts.length < maxOccurrences && guard < maxOccurrences) {
      starts.push(new Date(cursor));
      cursor = addDays(cursor, interval);
      guard += 1;
    }
  }

  if (settings.unit === "week") {
    const weekdays = Array.from(new Set((settings.weekdays?.length ? settings.weekdays : [start.getDay()]).map((day) => clampInteger(day, 0, 6)))).sort((a, b) => a - b);
    let weekCursor = startOfWeek(start);
    let guard = 0;
    while (weekCursor <= limit && starts.length < maxOccurrences && guard < maxOccurrences) {
      for (const weekday of weekdays) {
        const candidate = copyDateWithTime(addDays(weekCursor, weekday), time);
        if (candidate >= start && candidate <= limit) starts.push(candidate);
      }
      weekCursor = addDays(weekCursor, interval * 7);
      guard += 1;
    }
  }

  if (settings.unit === "month") {
    const day = clampInteger(settings.monthDay || start.getDate(), 1, 31);
    let monthCursor = new Date(start.getFullYear(), start.getMonth(), 1);
    let guard = 0;
    while (monthCursor <= limit && starts.length < maxOccurrences && guard < maxOccurrences) {
      const candidate = monthDate(monthCursor.getFullYear(), monthCursor.getMonth(), day, time);
      if (candidate >= start && candidate <= limit) starts.push(candidate);
      monthCursor = addMonths(monthCursor, interval);
      guard += 1;
    }
  }

  const unique = Array.from(new Map(starts.sort((a, b) => a.getTime() - b.getTime()).map((date) => [date.getTime(), date])).values());
  return unique.length ? unique.slice(0, maxOccurrences).map(localDateTimeInputValue) : [startDateTime];
}
