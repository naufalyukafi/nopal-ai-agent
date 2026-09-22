/**
 * Date & Timezone Utilities for Indonesia Western Time (WIB / Asia/Jakarta: UTC+7)
 * Zero external dependencies. Ensures exact calendar math regardless of host server timezone (UTC).
 */

const WIB_OFFSET_HOURS = 7;
const WIB_OFFSET_MS = WIB_OFFSET_HOURS * 60 * 60 * 1000;

export interface WIBDateComponents {
  year: number;
  month: number; // 1-12 (Human-readable 1-indexed)
  day: number;
  hour: number;
  minute: number;
  second: number;
  millisecond: number;
}

/**
 * Returns number of days in a given year and month (1-12)
 */
export function getDaysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Converts a Date object to its calendar components in WIB (UTC+7).
 */
export function getWIBDate(date: Date = new Date()): WIBDateComponents {
  const wibTime = new Date(date.getTime() + WIB_OFFSET_MS);
  return {
    year: wibTime.getUTCFullYear(),
    month: wibTime.getUTCMonth() + 1, // 1-12
    day: wibTime.getUTCDate(),
    hour: wibTime.getUTCHours(),
    minute: wibTime.getUTCMinutes(),
    second: wibTime.getUTCSeconds(),
    millisecond: wibTime.getUTCMilliseconds(),
  };
}

/**
 * Returns the exact UTC Date corresponding to 00:00:00.000 WIB for the given reference date.
 * (e.g. 2026-09-22 00:00:00 WIB = 2026-09-21 17:00:00.000Z)
 */
export function getWIBStartOfDay(date: Date = new Date()): Date {
  const wib = getWIBDate(date);
  const utcEquivalent = Date.UTC(wib.year, wib.month - 1, wib.day, 0, 0, 0, 0);
  return new Date(utcEquivalent - WIB_OFFSET_MS);
}

/**
 * Returns the exact UTC Date corresponding to 23:59:59.999 WIB for the given reference date.
 * (e.g. 2026-09-22 23:59:59.999 WIB = 2026-09-22 16:59:59.999Z)
 */
export function getWIBEndOfDay(date: Date = new Date()): Date {
  const wib = getWIBDate(date);
  const utcEquivalent = Date.UTC(wib.year, wib.month - 1, wib.day, 23, 59, 59, 999);
  return new Date(utcEquivalent - WIB_OFFSET_MS);
}

/**
 * Returns ISO strings for the start and end of "Today" in WIB.
 */
export function getWIBTodayRange(date: Date = new Date()): { startDate: string; endDate: string } {
  return {
    startDate: getWIBStartOfDay(date).toISOString(),
    endDate: getWIBEndOfDay(date).toISOString(),
  };
}

/**
 * Returns the canonical YYYY-MM period string according to WIB calendar.
 */
export function getWIBMonthPeriod(date: Date = new Date()): string {
  const wib = getWIBDate(date);
  const monthStr = String(wib.month).padStart(2, '0');
  return `${wib.year}-${monthStr}`;
}

/**
 * Returns ISO strings for start and end of a given month (1-12) in WIB.
 */
export function getWIBMonthRange(year: number, month: number): { startDate: string; endDate: string } {
  const daysInMonth = getDaysInMonth(year, month);
  const startUtc = Date.UTC(year, month - 1, 1, 0, 0, 0, 0) - WIB_OFFSET_MS;
  const endUtc = Date.UTC(year, month - 1, daysInMonth, 23, 59, 59, 999) - WIB_OFFSET_MS;
  return {
    startDate: new Date(startUtc).toISOString(),
    endDate: new Date(endUtc).toISOString(),
  };
}
