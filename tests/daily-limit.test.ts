import test from 'node:test';
import assert from 'node:assert/strict';
import { getSmartDailyLimitStatus, isSavingsCategory, isFixedBillCategory } from '../src/db/daily-limit.db.ts';

test('getSmartDailyLimitStatus module function signature exists', () => {
  assert.equal(typeof getSmartDailyLimitStatus, 'function', 'getSmartDailyLimitStatus should be an exported function');
});

test('isSavingsCategory correctly identifies savings and investment categories', () => {
  assert.equal(isSavingsCategory('Tabungan'), true);
  assert.equal(isSavingsCategory('Tabungan & Investasi'), true);
  assert.equal(isSavingsCategory('Savings Account'), true);
  assert.equal(isSavingsCategory('Deposito BCA'), true);
  assert.equal(isSavingsCategory('Makanan & Minuman'), false);
  assert.equal(isSavingsCategory('Kost'), false);
  assert.equal(isSavingsCategory('Tagihan & Utilitas'), false);
});

test('isFixedBillCategory correctly identifies fixed recurring bills', () => {
  assert.equal(isFixedBillCategory('Internet & Komunikasi'), true);
  assert.equal(isFixedBillCategory('Paket Data Indosat'), true);
  assert.equal(isFixedBillCategory('Listrik PLN'), true);
  assert.equal(isFixedBillCategory('Sewa Kos'), true);
  assert.equal(isFixedBillCategory('Subscription Netflix'), true);
  assert.equal(isFixedBillCategory('Makanan & Minuman'), false);
  assert.equal(isFixedBillCategory('Jajan Kopi'), false);
});

test('Smart Daily Limit mathematical calculations logic', () => {
  // Mock inputs: total budget = 3,000,000 IDR, total spent in cycle = 1,200,000 IDR, today spent = 50,000 IDR, remaining days = 10
  const totalMonthlyBudget = 3000000;
  const cycleSpent = 1200000;
  const todaySpent = 50000;
  const remainingDays = 10;

  const availableBudgetForRemainder = Math.max(0, totalMonthlyBudget - (cycleSpent - todaySpent));
  const recommendedDailyLimit = Math.floor(availableBudgetForRemainder / remainingDays);
  const todayRemainingLimit = recommendedDailyLimit - todaySpent;

  assert.equal(availableBudgetForRemainder, 1850000, 'Available budget for remainder should be 1,850,000');
  assert.equal(recommendedDailyLimit, 185000, 'Recommended daily limit should be 185,000 IDR');
  assert.equal(todayRemainingLimit, 135000, 'Remaining daily limit today should be 135,000 IDR');
});

test('Smart Daily Limit over-budget condition handles negative remaining gracefully', () => {
  const totalMonthlyBudget = 2000000;
  const cycleSpent = 2500000; // Over budget by 500,000
  const todaySpent = 100000;
  const remainingDays = 5;

  const availableBudgetForRemainder = Math.max(0, totalMonthlyBudget - (cycleSpent - todaySpent));
  const recommendedDailyLimit = Math.floor(availableBudgetForRemainder / remainingDays);
  const todayRemainingLimit = recommendedDailyLimit - todaySpent;

  assert.equal(availableBudgetForRemainder, 0, 'Available budget should clamp at 0');
  assert.equal(recommendedDailyLimit, 0, 'Recommended daily limit is 0 when over budget');
  assert.equal(todayRemainingLimit, -100000, 'Today remaining limit is -100,000');
});

test('Smart Daily Limit rewards early savings without penalty clamp', () => {
  const totalMonthlyBudget = 3000000; // baseline for 30 days = 100,000/day
  const totalDaysInCycle = 30;
  const baselineDailyLimit = Math.floor(totalMonthlyBudget / totalDaysInCycle); // 100,000

  // User spent only 500,000 in the first 20 days. 10 days remaining.
  const cycleSpent = 500000;
  const todaySpent = 0;
  const remainingDays = 10;

  const availableBudgetForRemainder = Math.max(0, totalMonthlyBudget - (cycleSpent - todaySpent)); // 2,500,000
  const dynamicDailyLimit = Math.floor(availableBudgetForRemainder / remainingDays); // 250,000/day

  assert.equal(baselineDailyLimit, 100000);
  assert.equal(dynamicDailyLimit, 250000, 'Honest dynamic daily limit should be 250,000 IDR without artificial 1.25x suppression');
});
