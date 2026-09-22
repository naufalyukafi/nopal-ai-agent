import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateSalaryCycleDateRange } from '../src/db/budgets.db.ts';
import { getWIBDate } from '../src/utils/date.ts';

test('calculateSalaryCycleDateRange for default 1st of month', () => {
  const refDate = new Date('2026-09-20T12:00:00Z');
  const range = calculateSalaryCycleDateRange(1, refDate);

  const startWib = getWIBDate(new Date(range.startDate));
  const endWib = getWIBDate(new Date(range.endDate));

  assert.equal(startWib.year, 2026);
  assert.equal(startWib.month, 9);
  assert.equal(startWib.day, 1);
  assert.equal(startWib.hour, 0);

  assert.equal(endWib.year, 2026);
  assert.equal(endWib.month, 9);
  assert.equal(endWib.day, 30);
  assert.equal(endWib.hour, 23);

  assert.equal(range.cycleMonthPeriod, '2026-09');
});

test('calculateSalaryCycleDateRange for 25th cutoff before 25th of current month', () => {
  // Reference date: 20 September 2026 (day 20 < 25)
  // Cycle should be 25 August 2026 to 24 September 2026 in WIB
  const refDate = new Date('2026-09-20T12:00:00Z');
  const range = calculateSalaryCycleDateRange(25, refDate);

  const startWib = getWIBDate(new Date(range.startDate));
  const endWib = getWIBDate(new Date(range.endDate));

  assert.equal(startWib.year, 2026);
  assert.equal(startWib.month, 8);
  assert.equal(startWib.day, 25);
  assert.equal(startWib.hour, 0);

  assert.equal(endWib.year, 2026);
  assert.equal(endWib.month, 9);
  assert.equal(endWib.day, 24);
  assert.equal(endWib.hour, 23);

  assert.equal(range.cycleMonthPeriod, '2026-08');
});

test('calculateSalaryCycleDateRange for 25th cutoff after 25th of current month', () => {
  // Reference date: 26 September 2026 (day 26 >= 25)
  // Cycle should be 25 September 2026 to 24 October 2026 in WIB
  const refDate = new Date('2026-09-26T12:00:00Z');
  const range = calculateSalaryCycleDateRange(25, refDate);

  const startWib = getWIBDate(new Date(range.startDate));
  const endWib = getWIBDate(new Date(range.endDate));

  assert.equal(startWib.year, 2026);
  assert.equal(startWib.month, 9);
  assert.equal(startWib.day, 25);
  assert.equal(startWib.hour, 0);

  assert.equal(endWib.year, 2026);
  assert.equal(endWib.month, 10);
  assert.equal(endWib.day, 24);
  assert.equal(endWib.hour, 23);

  assert.equal(range.cycleMonthPeriod, '2026-09');
});

test('calculateSalaryCycleDateRange handles year rollover (December 25 to January 24)', () => {
  const refDate = new Date('2026-12-28T12:00:00Z');
  const range = calculateSalaryCycleDateRange(25, refDate);

  const startWib = getWIBDate(new Date(range.startDate));
  const endWib = getWIBDate(new Date(range.endDate));

  assert.equal(startWib.year, 2026);
  assert.equal(startWib.month, 12);
  assert.equal(startWib.day, 25);

  assert.equal(endWib.year, 2027);
  assert.equal(endWib.month, 1);
  assert.equal(endWib.day, 24);

  assert.equal(range.cycleMonthPeriod, '2026-12');
});

test('calculateSalaryCycleDateRange clamps cutoff day 31 safely in 30-day month (April)', () => {
  // April has only 30 days. Cutoff day 31 should be clamped to 30.
  const refDate = new Date('2026-04-15T12:00:00Z');
  const range = calculateSalaryCycleDateRange(31, refDate);

  const startWib = getWIBDate(new Date(range.startDate));
  const endWib = getWIBDate(new Date(range.endDate));

  assert.equal(startWib.year, 2026);
  assert.equal(startWib.month, 3);
  assert.equal(startWib.day, 31); // March has 31 days

  assert.equal(endWib.year, 2026);
  assert.equal(endWib.month, 4);
  assert.equal(endWib.day, 30); // April has 30 days, so 31-1 = 30
});
