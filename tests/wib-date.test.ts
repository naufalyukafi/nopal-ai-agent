import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getWIBDate,
  getWIBStartOfDay,
  getWIBEndOfDay,
  getWIBTodayRange,
  getWIBMonthPeriod,
  getDaysInMonth,
  getWIBMonthRange,
} from '../src/utils/date.ts';

test('getDaysInMonth accurately handles leap years and variable month lengths', () => {
  assert.equal(getDaysInMonth(2024, 2), 29, '2024 is a leap year (Feb should have 29 days)');
  assert.equal(getDaysInMonth(2026, 2), 28, '2026 is not a leap year (Feb should have 28 days)');
  assert.equal(getDaysInMonth(2026, 4), 30, 'April should have 30 days');
  assert.equal(getDaysInMonth(2026, 8), 31, 'August should have 31 days');
  assert.equal(getDaysInMonth(2026, 9), 30, 'September should have 30 days');
  assert.equal(getDaysInMonth(2026, 12), 31, 'December should have 31 days');
});

test('getWIBDate correctly adds 7 hours to UTC timestamp', () => {
  // 2026-09-22 18:00:00 UTC = 2026-09-23 01:00:00 WIB
  const utcDate = new Date('2026-09-22T18:00:00.000Z');
  const wib = getWIBDate(utcDate);

  assert.equal(wib.year, 2026);
  assert.equal(wib.month, 9);
  assert.equal(wib.day, 23);
  assert.equal(wib.hour, 1);
  assert.equal(wib.minute, 0);
});

test('getWIBStartOfDay and getWIBEndOfDay accurately anchor to WIB midnight (UTC+7)', () => {
  // Morning time in WIB: 01:00 WIB on 23 Sept = 18:00 UTC on 22 Sept
  const morningWib = new Date('2026-09-22T18:00:00.000Z');
  // Evening time in WIB: 23:00 WIB on 23 Sept = 16:00 UTC on 23 Sept
  const eveningWib = new Date('2026-09-23T16:00:00.000Z');

  const startMorning = getWIBStartOfDay(morningWib);
  const startEvening = getWIBStartOfDay(eveningWib);

  // Both should point to EXACTLY the same WIB start of day: 2026-09-23 00:00:00 WIB = 2026-09-22 17:00:00.000Z
  assert.equal(startMorning.toISOString(), '2026-09-22T17:00:00.000Z');
  assert.equal(startEvening.toISOString(), '2026-09-22T17:00:00.000Z');

  const endMorning = getWIBEndOfDay(morningWib);
  const endEvening = getWIBEndOfDay(eveningWib);

  // Both should point to EXACTLY the same WIB end of day: 2026-09-23 23:59:59.999 WIB = 2026-09-23 16:59:59.999Z
  assert.equal(endMorning.toISOString(), '2026-09-23T16:59:59.999Z');
  assert.equal(endEvening.toISOString(), '2026-09-23T16:59:59.999Z');
});

test('getWIBTodayRange returns 24 hours span in UTC matching WIB midnight-to-midnight', () => {
  const sampleDate = new Date('2026-09-22T10:00:00.000Z'); // 17:00 WIB
  const range = getWIBTodayRange(sampleDate);

  const startMs = new Date(range.startDate).getTime();
  const endMs = new Date(range.endDate).getTime();
  const diffMs = endMs - startMs + 1; // inclusive ms

  assert.equal(diffMs, 24 * 60 * 60 * 1000, 'Difference must be exactly 24 hours (86,400,000 ms)');
  assert.equal(range.startDate, '2026-09-21T17:00:00.000Z');
  assert.equal(range.endDate, '2026-09-22T16:59:59.999Z');
});

test('getWIBMonthPeriod formats YYYY-MM according to WIB calendar', () => {
  // 2026-09-30 18:00:00 UTC = 2026-10-01 01:00:00 WIB
  const endOfSeptUtc = new Date('2026-09-30T18:00:00.000Z');
  assert.equal(getWIBMonthPeriod(endOfSeptUtc), '2026-10', 'Should already be October in WIB');
});

test('getWIBMonthRange covers exact calendar month from 1st 00:00 WIB to last day 23:59 WIB', () => {
  const range = getWIBMonthRange(2026, 9); // September 2026 (30 days)
  // 2026-09-01 00:00:00 WIB = 2026-08-31 17:00:00.000Z
  assert.equal(range.startDate, '2026-08-31T17:00:00.000Z');
  // 2026-09-30 23:59:59.999 WIB = 2026-09-30 16:59:59.999Z
  assert.equal(range.endDate, '2026-09-30T16:59:59.999Z');
});
