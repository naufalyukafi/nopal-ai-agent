import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateSalaryCycleDateRange } from '../src/db/budgets.db.ts';

test('calculateSalaryCycleDateRange for default 1st of month', () => {
  const refDate = new Date('2026-09-20T12:00:00Z');
  const range = calculateSalaryCycleDateRange(1, refDate);

  assert.ok(range.startDate.startsWith('2026-09-01'), 'Start date should be 2026-09-01');
  assert.ok(range.endDate.startsWith('2026-09-30'), 'End date should be 2026-09-30');
});

test('calculateSalaryCycleDateRange for 25th cutoff before 25th of current month', () => {
  // Reference date: 20 September 2026 (day 20 < 25)
  // Cycle should be 25 August 2026 to 24 September 2026
  const refDate = new Date('2026-09-20T12:00:00Z');
  const range = calculateSalaryCycleDateRange(25, refDate);

  assert.ok(range.startDate.startsWith('2026-08-25'), 'Start date should be 2026-08-25');
  assert.ok(range.endDate.startsWith('2026-09-24'), 'End date should be 2026-09-24');
});

test('calculateSalaryCycleDateRange for 25th cutoff after 25th of current month', () => {
  // Reference date: 26 September 2026 (day 26 >= 25)
  // Cycle should be 25 September 2026 to 24 October 2026
  const refDate = new Date('2026-09-26T12:00:00Z');
  const range = calculateSalaryCycleDateRange(25, refDate);

  assert.ok(range.startDate.startsWith('2026-09-25'), 'Start date should be 2026-09-25');
  assert.ok(range.endDate.startsWith('2026-10-24'), 'End date should be 2026-10-24');
});
