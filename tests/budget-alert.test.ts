import test from 'node:test';
import assert from 'node:assert/strict';

function evaluateBudgetMilestoneAlert(
  status: { categoryName: string; limitAmount: number; percentageSpent: number },
  cache: Set<string>,
  userId: string,
  period: string
): { triggeredMilestone: number | null; shouldNotify: boolean } {
  const { categoryName, limitAmount, percentageSpent } = status;

  if (limitAmount <= 0) {
    return { triggeredMilestone: null, shouldNotify: false };
  }

  let milestone: 50 | 80 | 100 | null = null;
  if (percentageSpent >= 100) {
    milestone = 100;
  } else if (percentageSpent >= 80) {
    milestone = 80;
  } else if (percentageSpent >= 50) {
    milestone = 50;
  }

  if (!milestone) {
    return { triggeredMilestone: null, shouldNotify: false };
  }

  const cacheKey = `${userId}:${categoryName}:${period}:${milestone}`;
  if (cache.has(cacheKey)) {
    return { triggeredMilestone: milestone, shouldNotify: false };
  }

  cache.add(cacheKey);
  if (milestone >= 80) {
    cache.add(`${userId}:${categoryName}:${period}:50`);
  }
  if (milestone >= 100) {
    cache.add(`${userId}:${categoryName}:${period}:80`);
  }

  return { triggeredMilestone: milestone, shouldNotify: true };
}

test('budget alert debouncing prevents duplicate alerts on subsequent transactions', () => {
  const cache = new Set<string>();
  const userId = 'user-1';
  const period = '2026-09';

  // Transaction 1: 30% spent -> No alert
  const r1 = evaluateBudgetMilestoneAlert(
    { categoryName: 'Makanan', limitAmount: 1000000, percentageSpent: 30 },
    cache,
    userId,
    period
  );
  assert.equal(r1.shouldNotify, false);

  // Transaction 2: 55% spent -> First 50% milestone alert
  const r2 = evaluateBudgetMilestoneAlert(
    { categoryName: 'Makanan', limitAmount: 1000000, percentageSpent: 55 },
    cache,
    userId,
    period
  );
  assert.equal(r2.shouldNotify, true);
  assert.equal(r2.triggeredMilestone, 50);

  // Transaction 3: 60% spent -> Duplicate 50% milestone, MUST NOT notify
  const r3 = evaluateBudgetMilestoneAlert(
    { categoryName: 'Makanan', limitAmount: 1000000, percentageSpent: 60 },
    cache,
    userId,
    period
  );
  assert.equal(r3.shouldNotify, false, 'Should suppress duplicate 50% alert');

  // Transaction 4: 85% spent -> First 80% milestone alert
  const r4 = evaluateBudgetMilestoneAlert(
    { categoryName: 'Makanan', limitAmount: 1000000, percentageSpent: 85 },
    cache,
    userId,
    period
  );
  assert.equal(r4.shouldNotify, true);
  assert.equal(r4.triggeredMilestone, 80);

  // Transaction 5: 90% spent -> Duplicate 80% milestone, MUST NOT notify
  const r5 = evaluateBudgetMilestoneAlert(
    { categoryName: 'Makanan', limitAmount: 1000000, percentageSpent: 90 },
    cache,
    userId,
    period
  );
  assert.equal(r5.shouldNotify, false, 'Should suppress duplicate 80% alert');

  // Transaction 6: 110% spent -> First 100% milestone alert
  const r6 = evaluateBudgetMilestoneAlert(
    { categoryName: 'Makanan', limitAmount: 1000000, percentageSpent: 110 },
    cache,
    userId,
    period
  );
  assert.equal(r6.shouldNotify, true);
  assert.equal(r6.triggeredMilestone, 100);

  // Transaction 7: 115% spent -> Duplicate 100% milestone, MUST NOT notify
  const r7 = evaluateBudgetMilestoneAlert(
    { categoryName: 'Makanan', limitAmount: 1000000, percentageSpent: 115 },
    cache,
    userId,
    period
  );
  assert.equal(r7.shouldNotify, false, 'Should suppress duplicate 100% alert');

  // Category without limit (limitAmount: 0) NEVER notifies
  const rZeroLimit = evaluateBudgetMilestoneAlert(
    { categoryName: 'Lain-lain', limitAmount: 0, percentageSpent: 150 },
    cache,
    userId,
    period
  );
  assert.equal(rZeroLimit.shouldNotify, false);
});
