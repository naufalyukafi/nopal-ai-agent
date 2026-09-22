import test from 'node:test';
import assert from 'node:assert/strict';
import { getTodayTransactionsSummary } from '../src/db/transactions.db.ts';
import { getWIBTodayRange } from '../src/utils/date.ts';

test('getTodayTransactionsSummary module function signature exists', () => {
  assert.equal(typeof getTodayTransactionsSummary, 'function', 'getTodayTransactionsSummary should be an exported function');
});

test('WIB today range boundary filters 24-hour transactions accurately without UTC leak', () => {
  // Reference date: 2026-09-23 at 14:00:00 WIB (07:00:00 UTC)
  const refDate = new Date('2026-09-23T07:00:00.000Z');
  const { startDate, endDate } = getWIBTodayRange(refDate);

  const startMs = new Date(startDate).getTime();
  const endMs = new Date(endDate).getTime();

  // Test transactions at critical boundary points in WIB:
  // Tx 1: Yesterday night 23:59 WIB (16:59 UTC on 22 Sept) -> MUST BE EXCLUDED
  const txYesterdayNight = new Date('2026-09-22T16:59:00.000Z').getTime();

  // Tx 2: Today early morning 00:05 WIB (17:05 UTC on 22 Sept) -> MUST BE INCLUDED
  const txTodayEarlyMorning = new Date('2026-09-22T17:05:00.000Z').getTime();

  // Tx 3: Today noon 12:00 WIB (05:00 UTC on 23 Sept) -> MUST BE INCLUDED
  const txTodayNoon = new Date('2026-09-23T05:00:00.000Z').getTime();

  // Tx 4: Today late night 23:55 WIB (16:55 UTC on 23 Sept) -> MUST BE INCLUDED
  const txTodayLateNight = new Date('2026-09-23T16:55:00.000Z').getTime();

  // Tx 5: Tomorrow early morning 00:05 WIB (17:05 UTC on 23 Sept) -> MUST BE EXCLUDED
  const txTomorrowMorning = new Date('2026-09-23T17:05:00.000Z').getTime();

  assert.equal(txYesterdayNight >= startMs && txYesterdayNight <= endMs, false, 'Yesterday 23:59 WIB must be excluded');
  assert.equal(txTodayEarlyMorning >= startMs && txTodayEarlyMorning <= endMs, true, 'Today 00:05 WIB must be included');
  assert.equal(txTodayNoon >= startMs && txTodayNoon <= endMs, true, 'Today 12:00 WIB must be included');
  assert.equal(txTodayLateNight >= startMs && txTodayLateNight <= endMs, true, 'Today 23:55 WIB must be included');
  assert.equal(txTomorrowMorning >= startMs && txTomorrowMorning <= endMs, false, 'Tomorrow 00:05 WIB must be excluded');
});
