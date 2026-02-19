const FALLBACK_TIME_ZONE = "UTC";

function resolveTimeZone(timeZone: string): string {
  try {
    // throws RangeError if timezone is invalid
    new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
    return timeZone;
  } catch {
    return FALLBACK_TIME_ZONE;
  }
}

function parseDate(value: string | Date): Date | null {
  const date = typeof value === "string" ? new Date(value) : value;
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    maximumFractionDigits: 2
  }).format(amount);
}

export function isoNow(): string {
  return new Date().toISOString();
}

export function todayIsoDate(): string {
  const date = new Date();
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getDatePartsInZone(date: Date, timeZone: string): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
} {
  const safeDate = parseDate(date) ?? new Date();
  const safeZone = resolveTimeZone(timeZone);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: safeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).formatToParts(safeDate);

  const map = Object.fromEntries(parts.filter((item) => item.type !== "literal").map((item) => [item.type, item.value]));
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second)
  };
}

function getTimeZoneOffsetMs(date: Date, timeZone: string): number {
  const parts = getDatePartsInZone(date, timeZone);
  const zonedUtcMs = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return zonedUtcMs - date.getTime();
}

export function zonedDateToIso(dateIso: string, timeZone: string): string {
  return zonedDateTimeToIso(dateIso, "00:00", timeZone);
}

export function zonedDateTimeToIso(dateIso: string, timeHHmm: string, timeZone: string): string {
  const [yearStr, monthStr, dayStr] = dateIso.split("-");
  const [hourStr = "00", minuteStr = "00"] = timeHHmm.split(":");
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  const hour = Number(hourStr);
  const minute = Number(minuteStr);

  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day) ||
    !Number.isFinite(hour) ||
    !Number.isFinite(minute)
  ) {
    return new Date().toISOString();
  }

  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, 0);
  const guessDate = new Date(utcGuess);
  const offset = getTimeZoneOffsetMs(guessDate, resolveTimeZone(timeZone));
  const zonedInstant = new Date(utcGuess - offset);
  return zonedInstant.toISOString();
}

export function dateKeyInTimeZone(value: string | Date, timeZone: string): string {
  const date = parseDate(value);
  if (!date) {
    return todayIsoDate();
  }
  const parts = getDatePartsInZone(date, resolveTimeZone(timeZone));
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

export function todayInTimeZone(timeZone: string): string {
  return dateKeyInTimeZone(new Date(), timeZone);
}

export function formatDateTimeInTimeZone(value: string, timeZone: string): string {
  const date = parseDate(value);
  if (!date) {
    return "-";
  }

  return new Intl.DateTimeFormat(undefined, {
    timeZone: resolveTimeZone(timeZone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(date);
}

export function timeInTimeZoneHHmm(timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: resolveTimeZone(timeZone),
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(new Date());

  const map = Object.fromEntries(parts.filter((item) => item.type !== "literal").map((item) => [item.type, item.value]));
  return `${map.hour ?? "00"}:${map.minute ?? "00"}`;
}
